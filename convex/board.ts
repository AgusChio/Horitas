import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import {
  eachDate,
  emptyWeeks,
  isWeekend,
  isoDate,
  mondayOf,
  monthBounds,
  MONTHS,
  monthPrefix,
  rangeProblem,
  resolveSchedule,
  shortDay,
  weekdayIndex,
  WEEKDAY_LETTERS,
  weekNumber,
  weeksOfMonth,
  type RangeGroup,
} from "./dates";
import { closedBeforeMonth, TIPO_ORDER, type Country, type Tipo } from "./domain";
import { assertPeriod, displayName, getSettings, getUser } from "./lib";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function holidayMap(
  holidays: Doc<"holidays">[],
  year: number,
  month: number,
  country: Country,
) {
  const prefix = monthPrefix(year, month);
  const names = new Map<string, string>();
  for (const holiday of holidays) {
    if (holiday.country === country && holiday.date.startsWith(prefix)) {
      names.set(holiday.date, holiday.name);
    }
  }
  return names;
}

function personCapacity(args: {
  year: number;
  month: number;
  hoursPerDay: number;
  workdays: number[];
  holidays: Map<string, string>;
  absences: Doc<"absences">[];
}) {
  const { last } = monthBounds(args.year, args.month);
  const works = new Set(args.workdays);
  let businessDays = 0;
  let weekdayHolidays = 0;
  const holidayDetails: { date: string; name: string }[] = [];
  for (let day = 1; day <= last; day += 1) {
    const date = isoDate(args.year, args.month, day);
    const dow = weekdayIndex(args.year, args.month, day);
    const scheduled = works.has(dow);
    const name = args.holidays.get(date);
    if (name) {
      holidayDetails.push({ date, name });
      if (scheduled) weekdayHolidays += 1;
    }
    if (scheduled && !name) businessDays += 1;
  }

  let discountHours = 0;
  const absenceDetails = args.absences.map((absence) => {
    const [year, month, day] = absence.date.split("-").map(Number);
    const scheduled = works.has(weekdayIndex(year ?? 0, month ?? 1, day ?? 1));
    const onHoliday = args.holidays.has(absence.date);
    const applied = absence.discountsCapacity && scheduled && !onHoliday;
    if (applied) discountHours += args.hoursPerDay;
    return {
      _id: absence._id,
      date: absence.date,
      reason: absence.reason,
      discountsCapacity: absence.discountsCapacity,
      appliedHours: applied ? args.hoursPerDay : 0,
    };
  });

  const availableHours = businessDays * args.hoursPerDay;
  return {
    businessDays,
    weekdayHolidays,
    holidayDetails,
    absenceDetails,
    availableHours,
    discountHours,
    totalHours: availableHours - discountHours,
  };
}

async function monthContext(ctx: QueryCtx, year: number, month: number) {
  const { start, end, last } = monthBounds(year, month);
  const [settings, holidays, absences, items, entries, users] = await Promise.all([
    getSettings(ctx),
    ctx.db.query("holidays").collect(),
    ctx.db
      .query("absences")
      .withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
      .collect(),
    ctx.db
      .query("items")
      .withIndex("by_period", (q) => q.eq("year", year).eq("month", month))
      .collect(),
    ctx.db
      .query("entries")
      .withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
      .collect(),
    ctx.db.query("users").collect(),
  ]);
  return {
    start,
    end,
    last,
    hoursPerDay: settings?.hoursPerDay ?? 8,
    holidays,
    absences,
    items,
    entries,
    users: users.filter((user) => user.active !== false),
  };
}

export const get = query({
  args: { year: v.number(), month: v.number(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await getUser(ctx);
    if (!me || me.active === false) return null;
    assertPeriod(args.year, args.month);

    const data = await monthContext(ctx, args.year, args.month);
    const person = data.users.find((user) => user._id === args.userId);
    if (!person) return null;
    const country: Country = person.country === "CO" ? "CO" : "AR";
    const holidays = holidayMap(data.holidays, args.year, args.month, country);
    const colombia =
      country === "AR" ? holidayMap(data.holidays, args.year, args.month, "CO") : new Map<string, string>();
    const absences = data.absences.filter((absence) => absence.userId === person._id);
    const schedule = resolveSchedule(person, data.hoursPerDay);
    const capacity = personCapacity({
      year: args.year,
      month: args.month,
      hoursPerDay: schedule.hoursPerDay,
      workdays: schedule.workdays,
      holidays,
      absences,
    });
    const weeks = weeksOfMonth(args.year, args.month);
    const items = data.items
      .filter((item) => item.userId === person._id && !closedBeforeMonth(item.endedOn, item.year, item.month))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          TIPO_ORDER.indexOf(a.tipo) - TIPO_ORDER.indexOf(b.tipo) ||
          a.name.localeCompare(b.name, "es"),
      );

    const hoursOf = new Map<string, number>();
    const extraOf = new Map<string, number>();
    const extraTicketOf = new Map<string, string | null>();
    for (const entry of data.entries) {
      if (entry.userId !== person._id) continue;
      const key = `${entry.itemId}|${entry.date}`;
      hoursOf.set(key, entry.hours);
      extraOf.set(key, entry.extraHours ?? 0);
      extraTicketOf.set(key, entry.extraTicket ?? null);
    }

    const dayTotals = Array.from({ length: data.last }, () => 0);
    const dayExtras = Array.from({ length: data.last }, () => 0);
    let executed = 0;
    let extra = 0;
    const rows = items.map((item) => {
      const hours = Array.from({ length: data.last }, () => 0);
      const extras = Array.from({ length: data.last }, () => 0);
      const extraTickets: Array<string | null> = Array.from({ length: data.last }, () => null);
      const weekHours = emptyWeeks(weeks.length);
      const extraWeeks = emptyWeeks(weeks.length);
      for (let day = 1; day <= data.last; day += 1) {
        const date = isoDate(args.year, args.month, day);
        const key = `${item._id}|${date}`;
        const value = hoursOf.get(key) ?? 0;
        const overtime = extraOf.get(key) ?? 0;
        const weekIndex = weekNumber(args.year, args.month, day) - 1;
        hours[day - 1] = value;
        extras[day - 1] = overtime;
        extraTickets[day - 1] = extraTicketOf.get(key) ?? null;
        dayTotals[day - 1] += value;
        dayExtras[day - 1] += overtime;
        weekHours[weekIndex] += value;
        extraWeeks[weekIndex] += overtime;
        executed += value;
        extra += overtime;
      }
      return {
        _id: item._id,
        tipo: item.tipo,
        name: item.name,
        ticket: item.ticket,
        deployDate: item.deployDate,
        environment: item.environment,
        notes: item.notes,
        endedOn: item.endedOn ?? null,
        relatedKind: item.relatedKind ?? null,
        relatedTicket: item.relatedTicket ?? null,
        outcome: item.outcome ?? null,
        hours: hours.map(round2),
        extras: extras.map(round2),
        extraTickets,
        weeks: weekHours.map(round2),
        extraWeeks: extraWeeks.map(round2),
        total: round2(hours.reduce((sum, value) => sum + value, 0)),
        extraTotal: round2(extras.reduce((sum, value) => sum + value, 0)),
      };
    });

    const days = Array.from({ length: data.last }, (_, index) => {
      const day = index + 1;
      const date = isoDate(args.year, args.month, day);
      const dow = weekdayIndex(args.year, args.month, day);
      const absence = absences.find((item) => item.date === date);
      return {
        day,
        date,
        dow,
        letter: WEEKDAY_LETTERS[dow] ?? "",
        week: weekNumber(args.year, args.month, day),
        isWeekend: isWeekend(dow),
        isWorkday: schedule.workdays.includes(dow) && !holidays.has(date),
        holidayName: holidays.get(date) ?? null,
        infoHoliday: colombia.get(date) ?? null,
        absence: absence
          ? { reason: absence.reason, discountsCapacity: absence.discountsCapacity }
          : null,
      };
    });

    return {
      person: {
        _id: person._id,
        name: displayName(person),
        email: person.email ?? "",
        country: person.country ?? null,
        countryMissing: !person.country,
        role: person.role ?? "member",
      },
      hoursPerDay: schedule.hoursPerDay,
      schedule,
      days,
      weeks,
      items: rows,
      dayTotals: dayTotals.map(round2),
      dayExtras: dayExtras.map(round2),
      weekTotals: weeks.map((week) =>
        round2(
          rows.reduce((sum, row) => sum + (row.weeks[week.n - 1] ?? 0), 0),
        ),
      ),
      executed: round2(executed),
      extra: round2(extra),
      capacity,
    };
  },
});

async function buildTeamMonth(ctx: QueryCtx, year: number, month: number) {
    assertPeriod(year, month);
    const data = await monthContext(ctx, year, month);
    const weeks = weeksOfMonth(year, month);
    const maps = {
      AR: holidayMap(data.holidays, year, month, "AR"),
      CO: holidayMap(data.holidays, year, month, "CO"),
    };

    const people = data.users
      .map((person) => {
        const country: Country = person.country === "CO" ? "CO" : "AR";
        const absences = data.absences.filter((absence) => absence.userId === person._id);
        const schedule = resolveSchedule(person, data.hoursPerDay);
        const capacity = personCapacity({
          year,
          month,
          hoursPerDay: schedule.hoursPerDay,
          workdays: schedule.workdays,
          holidays: maps[country],
          absences,
        });
        const hidden = new Set(
          data.items
            .filter((item) => closedBeforeMonth(item.endedOn, item.year, item.month))
            .map((item) => item._id),
        );
        const weekHours = emptyWeeks(weeks.length);
        let regular = 0;
        let extra = 0;
        for (const entry of data.entries) {
          if (entry.userId !== person._id || hidden.has(entry.itemId)) continue;
          const day = Number(entry.date.slice(8, 10));
          const overtime = entry.extraHours ?? 0;
          weekHours[weekNumber(year, month, day) - 1] += entry.hours + overtime;
          regular += entry.hours;
          extra += overtime;
        }
        return {
          _id: person._id as Id<"users">,
          name: displayName(person),
          country: person.country ?? null,
          countryMissing: !person.country,
          ...capacity,
          absenceDetails: capacity.absenceDetails,
          ...schedule,
          regular: round2(regular),
          extra: round2(extra),
          executed: round2(regular + extra),
          weeks: weekHours.map(round2),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const visibleItems = data.items.filter((item) => !closedBeforeMonth(item.endedOn, item.year, item.month));
    const itemName = new Map(visibleItems.map((item) => [item._id, item]));
    const grouped = new Map<
      string,
      {
        itemId: Id<"items">;
        name: string;
        tipo: Tipo;
        ticket: string | null;
        userId: Id<"users">;
        personName: string;
        weeks: number[];
        total: number;
      }
    >();

    for (const item of visibleItems) {
      const owner = people.find((person) => person._id === item.userId);
      if (!owner) continue;
      grouped.set(item._id, {
        itemId: item._id,
        name: item.name,
        tipo: item.tipo,
        ticket: item.ticket,
        userId: item.userId,
        personName: owner.name,
        weeks: emptyWeeks(weeks.length),
        total: 0,
      });
    }

    for (const entry of data.entries) {
      const row = grouped.get(entry.itemId);
      const item = itemName.get(entry.itemId);
      if (!row || !item) continue;
      const day = Number(entry.date.slice(8, 10));
      const amount = entry.hours + (entry.extraHours ?? 0);
      row.weeks[weekNumber(year, month, day) - 1] += amount;
      row.total += amount;
    }

    const rows = [...grouped.values()]
      .map((row) => ({ ...row, weeks: row.weeks.map(round2), total: round2(row.total) }))
      .sort(
        (a, b) =>
          b.total - a.total ||
          TIPO_ORDER.indexOf(a.tipo) - TIPO_ORDER.indexOf(b.tipo) ||
          a.name.localeCompare(b.name, "es"),
      );

    const countries = (["AR", "CO"] as const).map((country) => {
      const names = maps[country];
      const holidayDetails = [...names.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, name]) => ({ date, name }));
      let businessDays = 0;
      let weekdayHolidays = 0;
      for (let day = 1; day <= data.last; day += 1) {
        const date = isoDate(year, month, day);
        const weekend = isWeekend(weekdayIndex(year, month, day));
        const holiday = names.has(date);
        if (holiday && !weekend) weekdayHolidays += 1;
        if (!weekend && !holiday) businessDays += 1;
      }
      const countryPeople = people.filter((person) => person.country === country);
      const absenceDates = new Set(
        countryPeople.flatMap((person) => person.absenceDetails.map((absence) => absence.date)),
      );
      return {
        country,
        businessDays,
        weekdayHolidays,
        holidayCount: holidayDetails.length,
        holidayDetails,
        absenceCount: absenceDates.size,
        people: countryPeople.length,
      };
    });

    const capacityInitial = people.reduce((sum, person) => sum + person.availableHours, 0);
    const capacityTotal = people.reduce((sum, person) => sum + person.totalHours, 0);
    const executed = round2(people.reduce((sum, person) => sum + person.executed, 0));

    return {
      hoursPerDay: data.hoursPerDay,
      weeks: weeks.map((week) => ({ ...week, label: `S${week.n}` })),
      countries,
      people,
      rows,
      absences: people.flatMap((person) =>
        person.absenceDetails.map((absence) => ({
          ...absence,
          userId: person._id,
          personName: person.name,
          country: person.country,
        })),
      ),
      capacityInitial,
      capacityTotal,
      executed,
      deploys: listDeploys(data.items, data.start, data.end),
    };
}

export const teamMonth = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const me = await getUser(ctx);
    if (!me || me.active === false) return null;
    return await buildTeamMonth(ctx, args.year, args.month);
  },
});

export const sharedMonth = query({
  args: { token: v.string(), year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{32,64}$/.test(args.token)) return null;
    const settings = await getSettings(ctx);
    if (!settings?.shareToken || settings.shareToken !== args.token) return null;
    return await buildTeamMonth(ctx, args.year, args.month);
  },
});

const rangeGroup = v.union(v.literal("mes"), v.literal("semana"), v.literal("dia"));

function rangeBuckets(start: string, end: string, group: RangeGroup) {
  const dates = eachDate(start, end);
  const [year, month] = start.split("-").map(Number);
  const fullMonth =
    group === "semana" &&
    start.endsWith("-01") &&
    start.slice(0, 7) === end.slice(0, 7) &&
    end === monthBounds(year ?? 0, month ?? 1).end;
  if (fullMonth) {
    return weeksOfMonth(year ?? 0, month ?? 1).map((week) => ({
      n: week.n,
      start: week.start,
      end: week.end,
      label: `S${week.n}`,
      dates: dates.filter((date) => {
        const day = Number(date.slice(8, 10));
        return day >= week.start && day <= week.end;
      }),
    }));
  }
  const grouped = new Map<string, { label: string; dates: string[] }>();
  for (const date of dates) {
    const key = group === "dia" ? date : group === "mes" ? date.slice(0, 7) : mondayOf(date);
    const label =
      group === "mes"
        ? (MONTHS[Number(date.slice(5, 7)) - 1] ?? key).slice(0, 3)
        : shortDay(group === "dia" ? date : key);
    const found = grouped.get(key) ?? { label, dates: [] as string[] };
    found.dates.push(date);
    grouped.set(key, found);
  }
  return [...grouped.values()].map((value, index) => ({
    n: index + 1,
    start: 0,
    end: 0,
    label: value.label,
    dates: value.dates,
  }));
}

async function buildTeamRange(ctx: QueryCtx, start: string, end: string, group: RangeGroup) {
  const problem = rangeProblem(start, end, group);
  if (problem) throw new ConvexError(problem);
  const dates = eachDate(start, end);
  const dateSet = new Set(dates);
  const [settings, holidays, absences, entries, users] = await Promise.all([
    getSettings(ctx),
    ctx.db.query("holidays").collect(),
    ctx.db.query("absences").withIndex("by_date", (q) => q.gte("date", start).lte("date", end)).collect(),
    ctx.db.query("entries").withIndex("by_date", (q) => q.gte("date", start).lte("date", end)).collect(),
    ctx.db.query("users").collect(),
  ]);
  const months = new Map<string, { year: number; month: number }>();
  for (const date of dates) {
    const [year, month] = date.split("-").map(Number);
    months.set(`${year}-${month}`, { year: year ?? 0, month: month ?? 1 });
  }
  const items = (
    await Promise.all(
      [...months.values()].map((period) =>
        ctx.db
          .query("items")
          .withIndex("by_period", (q) => q.eq("year", period.year).eq("month", period.month))
          .collect(),
      ),
    )
  ).flat();
  const visibleItems = items.filter((item) => !closedBeforeMonth(item.endedOn, item.year, item.month));
  const hidden = new Set(items.filter((item) => !visibleItems.includes(item)).map((item) => item._id));
  const buckets = rangeBuckets(start, end, group);
  const bucketDates = buckets.map((bucket) => new Set(bucket.dates));
  const hoursPerDay = settings?.hoursPerDay ?? 8;
  const people = users
    .filter((user) => user.active !== false)
    .map((person) => {
      const country: Country = person.country === "CO" ? "CO" : "AR";
      const schedule = resolveSchedule(person, hoursPerDay);
      const works = new Set(schedule.workdays);
      const holidayNames = new Set(
        holidays.filter((holiday) => holiday.country === country && dateSet.has(holiday.date)).map((holiday) => holiday.date),
      );
      let businessDays = 0;
      for (const date of dates) {
        const [year, month, day] = date.split("-").map(Number);
        const scheduled = works.has(weekdayIndex(year ?? 0, month ?? 1, day ?? 1));
        if (scheduled && !holidayNames.has(date)) businessDays += 1;
      }
      let discountHours = 0;
      for (const absence of absences) {
        if (absence.userId !== person._id || !absence.discountsCapacity || !dateSet.has(absence.date)) continue;
        const [year, month, day] = absence.date.split("-").map(Number);
        const scheduled = works.has(weekdayIndex(year ?? 0, month ?? 1, day ?? 1));
        if (scheduled && !holidayNames.has(absence.date)) discountHours += schedule.hoursPerDay;
      }
      const availableHours = businessDays * schedule.hoursPerDay;
      const bucketHours = emptyWeeks(buckets.length);
      let regular = 0;
      let extra = 0;
      for (const entry of entries) {
        if (entry.userId !== person._id || !dateSet.has(entry.date) || hidden.has(entry.itemId)) continue;
        const overtime = entry.extraHours ?? 0;
        const index = bucketDates.findIndex((set) => set.has(entry.date));
        if (index >= 0) bucketHours[index] += entry.hours + overtime;
        regular += entry.hours;
        extra += overtime;
      }
      return {
        _id: person._id as Id<"users">,
        name: displayName(person),
        country: person.country ?? null,
        countryMissing: !person.country,
        ...schedule,
        businessDays,
        weekdayHolidays: 0,
        holidayDetails: [] as { date: string; name: string }[],
        absenceDetails: [] as {
          _id: Id<"absences">;
          date: string;
          reason: string;
          discountsCapacity: boolean;
          appliedHours: number;
        }[],
        availableHours,
        discountHours,
        totalHours: availableHours - discountHours,
        regular: round2(regular),
        extra: round2(extra),
        executed: round2(regular + extra),
        weeks: bucketHours.map(round2),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const grouped = new Map<
    string,
    {
      itemId: Id<"items">;
      name: string;
      tipo: Tipo;
      ticket: string | null;
      userId: Id<"users">;
      personName: string;
      weeks: number[];
      total: number;
    }
  >();
  for (const entry of entries) {
    if (!dateSet.has(entry.date)) continue;
    const item = visibleItems.find((candidate) => candidate._id === entry.itemId);
    const owner = people.find((person) => person._id === entry.userId);
    if (!item || !owner) continue;
    const key = `${item.userId}|${item.tipo}|${item.name}|${item.ticket ?? ""}`;
    const row = grouped.get(key) ?? {
      itemId: item._id,
      name: item.name,
      tipo: item.tipo,
      ticket: item.ticket,
      userId: item.userId,
      personName: owner.name,
      weeks: emptyWeeks(buckets.length),
      total: 0,
    };
    const amount = entry.hours + (entry.extraHours ?? 0);
    const index = bucketDates.findIndex((set) => set.has(entry.date));
    if (index >= 0) row.weeks[index] += amount;
    row.total += amount;
    grouped.set(key, row);
  }
  const rows = [...grouped.values()]
    .map((row) => ({ ...row, weeks: row.weeks.map(round2), total: round2(row.total) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));

  return {
    hoursPerDay,
    weeks: buckets.map(({ n, start: from, end: to, label }) => ({ n, start: from, end: to, label })),
    countries: [] as {
      country: Country;
      businessDays: number;
      weekdayHolidays: number;
      holidayCount: number;
      holidayDetails: { date: string; name: string }[];
      absenceCount: number;
      people: number;
    }[],
    people,
    rows,
    absences: [] as {
      _id: Id<"absences">;
      date: string;
      reason: string;
      discountsCapacity: boolean;
      appliedHours: number;
      userId: Id<"users">;
      personName: string;
      country: "AR" | "CO" | null;
    }[],
    capacityInitial: people.reduce((sum, person) => sum + person.availableHours, 0),
    capacityTotal: people.reduce((sum, person) => sum + person.totalHours, 0),
    executed: round2(people.reduce((sum, person) => sum + person.executed, 0)),
    deploys: listDeploys(items, start, end),
  };
}

function listDeploys(
  items: {
    tipo: string;
    deployDate: string | null;
    outcome?: "exitoso" | "no_exitoso" | "rollback" | null;
    userId: Id<"users">;
    ticket: string | null;
    name: string;
  }[],
  start: string,
  end: string,
) {
  return items
    .filter((item) => item.tipo === "despliegue" && item.deployDate && item.deployDate >= start && item.deployDate <= end)
    .map((item) => ({
      userId: item.userId,
      outcome: item.outcome ?? null,
      deployDate: item.deployDate ?? "",
      ticket: item.ticket,
      name: item.name,
    }));
}

export const teamRange = query({
  args: { start: v.string(), end: v.string(), group: rangeGroup },
  handler: async (ctx, args) => {
    const me = await getUser(ctx);
    if (!me || me.active === false) return null;
    return await buildTeamRange(ctx, args.start, args.end, args.group);
  },
});

export const sharedRange = query({
  args: { token: v.string(), start: v.string(), end: v.string(), group: rangeGroup },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{32,64}$/.test(args.token)) return null;
    const settings = await getSettings(ctx);
    if (!settings?.shareToken || settings.shareToken !== args.token) return null;
    return await buildTeamRange(ctx, args.start, args.end, args.group);
  },
});
