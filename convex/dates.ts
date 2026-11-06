export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export const WEEKDAY_LETTERS = ["D", "L", "M", "X", "J", "V", "S"] as const;

export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayIndex(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekend(weekday: number) {
  return weekday === 0 || weekday === 6;
}

export function monthPrefix(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

export function monthBounds(year: number, month: number) {
  const last = daysInMonth(year, month);
  return {
    last,
    start: isoDate(year, month, 1),
    end: isoDate(year, month, last),
  };
}

/** Semana de lunes a domingo. S1 arranca el día 1, aunque sea miércoles. */
export function weekNumber(year: number, month: number, day: number) {
  const firstWeekday = weekdayIndex(year, month, 1);
  const mondayOffset = (firstWeekday + 6) % 7;
  return Math.floor((day + mondayOffset - 1) / 7) + 1;
}

export function weeksOfMonth(year: number, month: number) {
  const last = daysInMonth(year, month);
  const buckets: { n: number; start: number; end: number }[] = [];
  for (let day = 1; day <= last; day += 1) {
    const n = weekNumber(year, month, day);
    const found = buckets.find((bucket) => bucket.n === n);
    if (found) found.end = day;
    else buckets.push({ n, start: day, end: day });
  }
  return buckets;
}

export function countBusinessDays(
  year: number,
  month: number,
  holidayDates: Iterable<string>,
) {
  const holidays = new Set(holidayDates);
  const last = daysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= last; day += 1) {
    if (isWeekend(weekdayIndex(year, month, day))) continue;
    if (holidays.has(isoDate(year, month, day))) continue;
    count += 1;
  }
  return count;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function monthTitle(year: number, month: number) {
  const name = MONTHS[month - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function longDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} de ${MONTHS[(month ?? 1) - 1]} de ${year}`;
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function eachDate(start: string, end: string) {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return [];
  const dates: string[] = [];
  const [year, month, day] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const last = Date.UTC(endYear ?? 0, (endMonth ?? 1) - 1, endDay ?? 1);
  while (cursor.getTime() <= last) {
    dates.push(isoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function mondayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const back = (weekdayIndex(year ?? 0, month ?? 1, day ?? 1) + 6) % 7;
  const cursor = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - back));
  return isoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
}

export function shortDay(date: string) {
  const [, month, day] = date.split("-").map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? "";
  return `${day} ${name.slice(0, 3)}`;
}

export type RangeGroup = "mes" | "semana" | "dia";

export function rangeProblem(start: string, end: string, group: RangeGroup) {
  if (!isIsoDate(start) || !isIsoDate(end)) return "Elegí un desde y un hasta válidos.";
  if (start > end) return "El desde tiene que ser anterior al hasta.";
  const count = eachDate(start, end).length;
  if (group === "dia" && count > 62) return "Por día se puede ver hasta 62 días.";
  if (group === "semana" && count > 186) return "Por semana se puede ver hasta 6 meses.";
  if (count > 550) return "El rango puede cubrir hasta 18 meses.";
  return null;
}

export function emptyWeeks(length: number) {
  return Array.from({ length }, () => 0);
}

export function addToWeek(weeks: number[], index: number, hours: number) {
  if (index >= 0 && index < weeks.length) weeks[index] += hours;
}

export const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

const DAY_NAMES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function clockTime(value: string | null | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value ?? "");
  return match ? `${match[1]}:${match[2]}` : null;
}

export function resolveSchedule(
  person: {
    hoursPerDay?: number | null;
    workdays?: number[] | null;
    workStart?: string | null;
    workEnd?: string | null;
  },
  fallbackHours: number,
) {
  const hours = person.hoursPerDay;
  const hoursPerDay = typeof hours === "number" && hours >= 1 && hours <= 12 ? hours : fallbackHours;
  const days = (person.workdays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return {
    hoursPerDay,
    workdays: days.length > 0 ? [...new Set(days)] : [...DEFAULT_WORKDAYS],
    workStart: clockTime(person.workStart) ?? "09:00",
    workEnd: clockTime(person.workEnd) ?? "18:00",
  };
}

export function scheduleSummary(workdays: number[], hours: number) {
  const sorted = DAY_ORDER.filter((day) => workdays.includes(day));
  const names = sorted.map((day) => DAY_NAMES[day] ?? "");
  const consecutive = sorted.every((day, index) => {
    if (index === 0) return true;
    const previous = sorted[index - 1];
    return previous !== undefined && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(previous) + 1;
  });
  const span =
    consecutive && names.length > 1 ? `${names[0]} a ${names[names.length - 1]}` : names.join(", ");
  return `${span} · ${hours} h`;
}

export function cumulative(values: number[]) {
  const totals: number[] = [];
  let acc = 0;
  for (const value of values) {
    acc += value;
    totals.push(acc);
  }
  return totals;
}
