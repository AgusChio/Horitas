import { ConvexError, v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { isIsoDate } from "./dates";
import { HOLIDAYS } from "./holidaysData";
import { getUser, requireUser } from "./lib";

export async function insertMissingHolidays(ctx: MutationCtx) {
  const existing = await ctx.db.query("holidays").collect();
  const keys = new Set(existing.map((holiday) => `${holiday.country}|${holiday.date}`));
  let added = 0;
  for (const holiday of HOLIDAYS) {
    const key = `${holiday.country}|${holiday.date}`;
    if (keys.has(key)) continue;
    await ctx.db.insert("holidays", { ...holiday, source: "oficial" });
    keys.add(key);
    added += 1;
  }
  return added;
}

export const list = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (!user || user.active === false) return [];
    const prefix = `${args.year}-`;
    const holidays = await ctx.db.query("holidays").collect();
    return holidays
      .filter((holiday) => holiday.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
  },
});

export const add = mutation({
  args: {
    date: v.string(),
    country: v.union(v.literal("AR"), v.literal("CO")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!isIsoDate(args.date)) throw new ConvexError("Esa fecha no es válida.");
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name.length < 3) throw new ConvexError("Poné el nombre del feriado.");
    const existing = await ctx.db
      .query("holidays")
      .withIndex("by_country_date", (q) => q.eq("country", args.country).eq("date", args.date))
      .unique();
    if (existing) {
      throw new ConvexError("Ese día ya está cargado para ese país.");
    }
    await ctx.db.insert("holidays", {
      date: args.date,
      country: args.country,
      name: name.slice(0, 120),
      source: "manual",
    });
  },
});

export const update = mutation({
  args: {
    holidayId: v.id("holidays"),
    date: v.string(),
    country: v.union(v.literal("AR"), v.literal("CO")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const holiday = await ctx.db.get(args.holidayId);
    if (!holiday) throw new ConvexError("Ese feriado ya no está.");
    if (!isIsoDate(args.date)) throw new ConvexError("Esa fecha no es válida.");
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name.length < 3) throw new ConvexError("Poné el nombre del feriado.");
    const existing = await ctx.db
      .query("holidays")
      .withIndex("by_country_date", (q) => q.eq("country", args.country).eq("date", args.date))
      .unique();
    if (existing && existing._id !== holiday._id) {
      throw new ConvexError("Ese día ya está cargado para ese país.");
    }
    await ctx.db.patch(holiday._id, {
      date: args.date,
      country: args.country,
      name: name.slice(0, 120),
    });
  },
});

export const remove = mutation({
  args: { holidayId: v.id("holidays") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const holiday = await ctx.db.get(args.holidayId);
    if (!holiday) throw new ConvexError("Ese feriado ya no está.");
    await ctx.db.delete(args.holidayId);
  },
});

export const restoreOfficial = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await insertMissingHolidays(ctx);
  },
});

export const addAbsence = mutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    reason: v.string(),
    discountsCapacity: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!isIsoDate(args.date)) throw new ConvexError("Esa fecha no es válida.");
    const person = await ctx.db.get(args.userId);
    if (!person || person.active === false) throw new ConvexError("No encontré a esa persona.");
    const reason = args.reason.trim().replace(/\s+/g, " ");
    if (reason.length < 2) throw new ConvexError("Poné el motivo de la ausencia.");
    const existing = await ctx.db
      .query("absences")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", args.date))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        reason: reason.slice(0, 120),
        discountsCapacity: args.discountsCapacity,
      });
      return;
    }
    await ctx.db.insert("absences", {
      userId: args.userId,
      date: args.date,
      reason: reason.slice(0, 120),
      discountsCapacity: args.discountsCapacity,
    });
  },
});

export const updateAbsence = mutation({
  args: {
    absenceId: v.id("absences"),
    date: v.string(),
    reason: v.string(),
    discountsCapacity: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const absence = await ctx.db.get(args.absenceId);
    if (!absence) throw new ConvexError("Esa ausencia ya no está.");
    if (!isIsoDate(args.date)) throw new ConvexError("Esa fecha no es válida.");
    const reason = args.reason.trim().replace(/\s+/g, " ");
    if (reason.length < 2) throw new ConvexError("Poné el motivo de la ausencia.");
    const existing = await ctx.db
      .query("absences")
      .withIndex("by_user_date", (q) => q.eq("userId", absence.userId).eq("date", args.date))
      .unique();
    if (existing && existing._id !== absence._id) {
      throw new ConvexError("Esa persona ya tiene una ausencia ese día.");
    }
    await ctx.db.patch(absence._id, {
      date: args.date,
      reason: reason.slice(0, 120),
      discountsCapacity: args.discountsCapacity,
    });
  },
});

export const removeAbsence = mutation({
  args: { absenceId: v.id("absences") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const absence = await ctx.db.get(args.absenceId);
    if (!absence) throw new ConvexError("Esa ausencia ya no está.");
    await ctx.db.delete(args.absenceId);
  },
});
