import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isIsoDate, shiftMonth } from "./dates";
import { normalizeItem, roundHours, sameItem } from "./domain";
import { tipoValidator } from "./schema";
import { assertPeriod, requireUser } from "./lib";

async function itemsFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  year: number,
  month: number,
) {
  return await ctx.db
    .query("items")
    .withIndex("by_user_period", (q) => q.eq("userId", userId).eq("year", year).eq("month", month))
    .collect();
}

export const setHours = mutation({
  args: {
    itemId: v.id("items"),
    date: v.string(),
    hours: v.number(),
    kind: v.optional(v.union(v.literal("regular"), v.literal("extra"))),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!isIsoDate(args.date)) throw new ConvexError("Esa fecha no es válida.");
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Ese ítem ya no está.");
    const [year, month] = args.date.split("-").map(Number);
    if (year !== item.year || month !== item.month) {
      throw new ConvexError("Ese día no pertenece al mes del ítem.");
    }
    if (!Number.isFinite(args.hours) || args.hours < 0 || args.hours > 24) {
      throw new ConvexError("Las horas tienen que estar entre 0 y 24.");
    }
    const next = roundHours(args.hours);
    const existing = await ctx.db
      .query("entries")
      .withIndex("by_item_date", (q) => q.eq("itemId", item._id).eq("date", args.date))
      .unique();
    const regular = args.kind === "extra" ? (existing?.hours ?? 0) : next;
    const extra = args.kind === "extra" ? next : (existing?.extraHours ?? 0);
    if (regular === 0 && extra === 0) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { hours: regular, extraHours: extra });
      return;
    }
    await ctx.db.insert("entries", {
      itemId: item._id,
      userId: item.userId,
      date: args.date,
      hours: regular,
      extraHours: extra,
    });
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    year: v.number(),
    month: v.number(),
    tipo: tipoValidator,
    name: v.string(),
    ticket: v.optional(v.string()),
    deployDate: v.optional(v.string()),
    environment: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    assertPeriod(args.year, args.month);
    const person = await ctx.db.get(args.userId);
    if (!person || person.active === false) throw new ConvexError("No encontré a esa persona.");
    const normalized = normalizeItem(args);
    const current = await itemsFor(ctx, args.userId, args.year, args.month);
    if (current.some((item) => sameItem(item, normalized))) {
      throw new ConvexError("Ese ítem ya está en el mes.");
    }
    const sortOrder = current.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
    return await ctx.db.insert("items", {
      userId: args.userId,
      year: args.year,
      month: args.month,
      sortOrder,
      ...normalized,
    });
  },
});

export const update = mutation({
  args: {
    itemId: v.id("items"),
    tipo: tipoValidator,
    name: v.string(),
    ticket: v.optional(v.string()),
    deployDate: v.optional(v.string()),
    environment: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Ese ítem ya no está.");
    const normalized = normalizeItem(args);
    const current = await itemsFor(ctx, item.userId, item.year, item.month);
    if (current.some((other) => other._id !== item._id && sameItem(other, normalized))) {
      throw new ConvexError("Ese ítem ya está en el mes.");
    }
    await ctx.db.patch(item._id, normalized);
  },
});

export const remove = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) return;
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_item_date", (q) => q.eq("itemId", item._id))
      .collect();
    for (const entry of entries) await ctx.db.delete(entry._id);
    await ctx.db.delete(item._id);
  },
});

export const move = mutation({
  args: { itemId: v.id("items"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) return;
    const current = await itemsFor(ctx, item.userId, item.year, item.month);
    const sameType = current
      .filter((other) => other.tipo === item.tipo)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
    const index = sameType.findIndex((other) => other._id === item._id);
    const target = index + (args.direction === "up" ? -1 : 1);
    if (index < 0 || target < 0 || target >= sameType.length) return;
    const reordered = sameType.slice();
    const [picked] = reordered.splice(index, 1);
    if (!picked) return;
    reordered.splice(target, 0, picked);
    for (const [position, row] of reordered.entries()) {
      const sortOrder = (position + 1) * 10;
      if (row.sortOrder !== sortOrder) await ctx.db.patch(row._id, { sortOrder });
    }
  },
});

export const startMonth = mutation({
  args: { userId: v.id("users"), year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    assertPeriod(args.year, args.month);
    const person = await ctx.db.get(args.userId);
    if (!person || person.active === false) throw new ConvexError("No encontré a esa persona.");
    const current = await itemsFor(ctx, args.userId, args.year, args.month);
    if (current.length > 0) return 0;
    const seeds = [
      normalizeItem({ tipo: "bandeja", name: "Incidentes & Service Request" }),
      normalizeItem({ tipo: "gestion", name: "Gestión" }),
    ];
    for (const [index, seed] of seeds.entries()) {
      await ctx.db.insert("items", {
        userId: args.userId,
        year: args.year,
        month: args.month,
        sortOrder: index + 1,
        ...seed,
      });
    }
    return seeds.length;
  },
});

export const copyPrevious = mutation({
  args: { userId: v.id("users"), year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    assertPeriod(args.year, args.month);
    const previous = shiftMonth(args.year, args.month, -1);
    const source = await itemsFor(ctx, args.userId, previous.year, previous.month);
    const current = await itemsFor(ctx, args.userId, args.year, args.month);
    const identities = current.map((item) => ({
      tipo: item.tipo,
      name: item.name,
      ticket: item.ticket,
    }));
    let sortOrder = current.reduce((max, item) => Math.max(max, item.sortOrder), 0);
    let copied = 0;
    for (const item of source.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const next = { tipo: item.tipo, name: item.name, ticket: item.ticket };
      if (identities.some((existing) => sameItem(existing, next))) continue;
      sortOrder += 1;
      copied += 1;
      identities.push(next);
      await ctx.db.insert("items", {
        userId: args.userId,
        year: args.year,
        month: args.month,
        sortOrder,
        tipo: item.tipo,
        name: item.name,
        ticket: item.ticket,
        deployDate: null,
        environment: item.environment,
        notes: item.notes,
      });
    }
    return copied;
  },
});
