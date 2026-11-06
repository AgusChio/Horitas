import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { insertMissingHolidays } from "./calendar";
import { assertAdmin, displayName, getSettings, getUser, requireUser } from "./lib";

function cleanDomains(values: string[]) {
  const tokens = values
    .flatMap((value) => value.split(/[\s,;]+/))
    .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const invalid = tokens.filter((token) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(token));
  if (invalid.length > 0) {
    throw new ConvexError(`Revisá estos dominios: ${invalid.join(", ")}.`);
  }
  return [...new Set(tokens)];
}

export const bootstrap = query({
  args: {},
  handler: async (ctx) => {
    const anyUser = await ctx.db.query("users").first();
    return { hasUsers: anyUser !== null };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => getUser(ctx),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const meUser = await getUser(ctx);
    if (!meUser || meUser.active === false) return null;
    const users = await ctx.db.query("users").collect();
    const settings = await getSettings(ctx);
    return {
      me: meUser,
      settings: settings && {
        hoursPerDay: settings.hoursPerDay,
        allowedDomains: settings.allowedDomains,
        allowAnyDomain: settings.allowAnyDomain,
      },
      people: users
        .map((user) => ({
          _id: user._id,
          name: displayName(user),
          email: user.email ?? "",
          country: user.country ?? null,
          role: user.role ?? "member",
          active: user.active !== false,
          theme: user.theme ?? "light",
          hoursPerDay: user.hoursPerDay ?? null,
          workdays: user.workdays ?? null,
          workStart: user.workStart ?? null,
          workEnd: user.workEnd ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    };
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    let settings = await getSettings(ctx);
    if (!settings) {
      const settingsId = await ctx.db.insert("settings", {
        key: "main",
        hoursPerDay: 8,
        allowedDomains: [],
        allowAnyDomain: false,
        holidaysLoaded: false,
      });
      settings = await ctx.db.get(settingsId);
    }
    if (settings && !settings.holidaysLoaded) {
      await insertMissingHolidays(ctx);
      await ctx.db.patch(settings._id, { holidaysLoaded: true });
    }
    const items = await ctx.db.query("items").collect();
    for (const item of items) {
      const name =
        item.tipo === "gestion" && item.name === "Gestión"
          ? "Reuniones"
          : item.tipo === "bandeja" &&
              (item.name === "Incidentes & Service Request" || item.name === "Incidentes y Service Request")
            ? "Incidente/Service Request"
            : null;
      if (name) await ctx.db.patch(item._id, { name });
    }
  },
});

export const updateSettings = mutation({
  args: {
    hoursPerDay: v.number(),
    allowedDomains: v.array(v.string()),
    allowAnyDomain: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertAdmin(user);
    if (args.hoursPerDay < 1 || args.hoursPerDay > 12) {
      throw new ConvexError("La jornada tiene que estar entre 1 y 12 horas.");
    }
    const domains = cleanDomains(args.allowedDomains);
    const settings = await getSettings(ctx);
    const patch = {
      hoursPerDay: args.hoursPerDay,
      allowedDomains: domains,
      allowAnyDomain: args.allowAnyDomain,
    };
    if (!settings) {
      await ctx.db.insert("settings", { key: "main", holidaysLoaded: false, ...patch });
      return;
    }
    await ctx.db.patch(settings._id, patch);
  },
});

export const setTheme = mutation({
  args: { theme: v.union(v.literal("light"), v.literal("dark")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { theme: args.theme });
  },
});

export const updateSchedule = mutation({
  args: {
    userId: v.id("users"),
    hoursPerDay: v.number(),
    workdays: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const person = await ctx.db.get(args.userId);
    if (!person) throw new ConvexError("No encontré a esa persona.");
    if (actor._id !== person._id) assertAdmin(actor);
    if (args.hoursPerDay < 1 || args.hoursPerDay > 12) {
      throw new ConvexError("La jornada tiene que estar entre 1 y 12 horas.");
    }
    const workdays = [...new Set(args.workdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
    if (workdays.length === 0) throw new ConvexError("Elegí al menos un día de trabajo.");
    await ctx.db.patch(person._id, {
      hoursPerDay: Math.round(args.hoursPerDay * 2) / 2,
      workdays,
    });
  },
});

export const updateMember = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    country: v.union(v.literal("AR"), v.literal("CO")),
    role: v.union(v.literal("admin"), v.literal("member")),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const person = await ctx.db.get(args.userId);
    if (!person) throw new ConvexError("No encontré a esa persona.");
    const editingSelf = actor._id === person._id;
    if (!editingSelf) assertAdmin(actor);
    if (editingSelf && actor.role !== "admin" && (args.role !== actor.role || !args.active)) {
      throw new ConvexError("No podés cambiar tu propio acceso.");
    }
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name.length < 3) throw new ConvexError("Completá el nombre y apellido.");

    const losesAdmin = person.role === "admin" && (args.role !== "admin" || !args.active);
    if (losesAdmin) {
      const users = await ctx.db.query("users").collect();
      const otherAdmins = users.filter(
        (user) => user._id !== person._id && user.role === "admin" && user.active !== false,
      );
      if (otherAdmins.length === 0) {
        throw new ConvexError("Tiene que quedar al menos una persona administradora.");
      }
    }

    await ctx.db.patch(person._id, {
      name,
      country: args.country,
      role: actor.role === "admin" ? args.role : person.role,
      active: actor.role === "admin" ? args.active : person.active !== false,
    });
  },
});

function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function saveShareToken(ctx: MutationCtx) {
  let settings = await getSettings(ctx);
  if (!settings) {
    const settingsId = await ctx.db.insert("settings", {
      key: "main",
      hoursPerDay: 8,
      allowedDomains: [],
      allowAnyDomain: false,
      holidaysLoaded: false,
      shareToken: makeToken(),
    });
    settings = await ctx.db.get(settingsId);
  }
  if (!settings) throw new ConvexError("No pude guardar el enlace.");
  if (!settings.shareToken) {
    const shareToken = makeToken();
    await ctx.db.patch(settings._id, { shareToken });
    return shareToken;
  }
  return settings.shareToken;
}

export const ensureShare = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await saveShareToken(ctx);
  },
});

export const rotateShare = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertAdmin(user);
    const shareToken = makeToken();
    const settings = await getSettings(ctx);
    if (!settings) {
      await ctx.db.insert("settings", {
        key: "main",
        hoursPerDay: 8,
        allowedDomains: [],
        allowAnyDomain: false,
        holidaysLoaded: false,
        shareToken,
      });
      return shareToken;
    }
    await ctx.db.patch(settings._id, { shareToken });
    return shareToken;
  },
});
