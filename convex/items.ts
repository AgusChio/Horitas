import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isIsoDate, shiftMonth } from "./dates";
import { closedBeforeMonth, normalizeItem, roundHours, sameItem, TIPO_ORDER, type Tipo } from "./domain";
import { tipoValidator } from "./schema";
import { assertPeriod, requireUser } from "./lib";

function assertDeployInMonth(tipo: string, deployDate: string | null, year: number, month: number) {
  if (tipo !== "despliegue" || !deployDate) return;
  const [deployYear, deployMonth] = deployDate.split("-").map(Number);
  if (deployYear !== year || deployMonth !== month) {
    throw new ConvexError("El día del despliegue tiene que estar en este mes.");
  }
}

async function syncClosure(
  ctx: MutationCtx,
  userId: Id<"users">,
  identity: { tipo: Tipo; name: string; ticket: string | null },
  endedOn: string | null,
) {
  if (identity.tipo !== "problema" && identity.tipo !== "requerimiento" && identity.tipo !== "bandeja") return;
  const all = await ctx.db.query("items").collect();
  for (const item of all) {
    if (item.userId !== userId || !sameItem(item, identity)) continue;
    if ((item.endedOn ?? null) === endedOn) continue;
    await ctx.db.patch(item._id, { endedOn });
  }
}

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
    extraTicket: v.optional(v.string()),
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
    if (closedBeforeMonth(item.endedOn, item.year, item.month)) {
      throw new ConvexError("Este ítem está terminado y no sigue en este mes.");
    }
    if (item.endedOn && args.date > item.endedOn) {
      throw new ConvexError("Este ítem está terminado. No se cargan horas después de esa fecha.");
    }
    if (item.tipo === "despliegue" && args.date !== item.deployDate) {
      throw new ConvexError("El despliegue dura un solo día. Cargá las horas en la fecha del cambio.");
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
    const typedTicket = (args.extraTicket ?? "").trim().toUpperCase().replace(/\s+/g, "");
    let extraTicket: string | null = existing?.extraTicket ?? null;
    if (extra === 0) extraTicket = null;
    else if (args.kind === "extra" && typedTicket) {
      if (!/^[A-Z0-9-]{2,40}$/.test(typedTicket)) {
        throw new ConvexError("Las horas extras necesitan el ticket donde se trabajaron.");
      }
      extraTicket = typedTicket;
    }
    if (regular === 0 && extra === 0) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { hours: regular, extraHours: extra, extraTicket });
      return;
    }
    await ctx.db.insert("entries", {
      itemId: item._id,
      userId: item.userId,
      date: args.date,
      hours: regular,
      extraHours: extra,
      extraTicket,
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
    endedOn: v.optional(v.string()),
    relatedKind: v.optional(v.string()),
    relatedTicket: v.optional(v.string()),
    outcome: v.optional(v.string()),
    urgency: v.optional(v.string()),
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
    assertDeployInMonth(normalized.tipo, normalized.deployDate, args.year, args.month);
    const sortOrder = current.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
    const id = await ctx.db.insert("items", {
      userId: args.userId,
      year: args.year,
      month: args.month,
      sortOrder,
      ...normalized,
    });
    await syncClosure(ctx, args.userId, normalized, normalized.endedOn);
    return id;
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
    endedOn: v.optional(v.string()),
    relatedKind: v.optional(v.string()),
    relatedTicket: v.optional(v.string()),
    outcome: v.optional(v.string()),
    urgency: v.optional(v.string()),
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
    assertDeployInMonth(normalized.tipo, normalized.deployDate, item.year, item.month);
    await ctx.db.patch(item._id, normalized);
    if (normalized.tipo === "despliegue" && normalized.deployDate) {
      const entries = await ctx.db
        .query("entries")
        .withIndex("by_item_date", (q) => q.eq("itemId", item._id))
        .collect();
      for (const entry of entries) {
        if (entry.date !== normalized.deployDate) await ctx.db.delete(entry._id);
      }
    }
    await syncClosure(ctx, item.userId, normalized, normalized.endedOn);
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
    const sorted = current.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        TIPO_ORDER.indexOf(a.tipo) - TIPO_ORDER.indexOf(b.tipo) ||
        a.name.localeCompare(b.name, "es"),
    );
    const index = sorted.findIndex((other) => other._id === item._id);
    const target = index + (args.direction === "up" ? -1 : 1);
    if (index < 0 || target < 0 || target >= sorted.length) return;
    const reordered = sorted.slice();
    const [picked] = reordered.splice(index, 1);
    if (!picked) return;
    reordered.splice(target, 0, picked);
    for (const [position, row] of reordered.entries()) {
      const sortOrder = (position + 1) * 10;
      if (row.sortOrder !== sortOrder) await ctx.db.patch(row._id, { sortOrder });
    }
  },
});

export const reorder = mutation({
  args: {
    userId: v.id("users"),
    year: v.number(),
    month: v.number(),
    itemIds: v.array(v.id("items")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    assertPeriod(args.year, args.month);
    const current = await itemsFor(ctx, args.userId, args.year, args.month);
    const sorted = current.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        TIPO_ORDER.indexOf(a.tipo) - TIPO_ORDER.indexOf(b.tipo) ||
        a.name.localeCompare(b.name, "es"),
    );
    const byId = new Map(sorted.map((item) => [item._id, item]));
    const picked = args.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const pickedSet = new Set(picked.map((item) => item._id));
    let cursor = 0;
    const reordered = sorted.map((item) => {
      if (!pickedSet.has(item._id)) return item;
      const replacement = picked[cursor];
      cursor += 1;
      return replacement ?? item;
    });
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
      if (item.tipo === "despliegue") continue;
      if (closedBeforeMonth(item.endedOn, args.year, args.month)) continue;
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
        endedOn: item.endedOn ?? null,
        relatedKind: item.relatedKind ?? null,
        relatedTicket: item.relatedTicket ?? null,
        outcome: item.outcome ?? null,
        urgency: item.urgency ?? null,
      });
    }
    return copied;
  },
});
