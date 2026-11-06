import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const countryValidator = v.union(v.literal("AR"), v.literal("CO"));

export const tipoValidator = v.union(
  v.literal("bandeja"),
  v.literal("gestion"),
  v.literal("documentacion"),
  v.literal("cierre"),
  v.literal("problema"),
  v.literal("requerimiento"),
  v.literal("despliegue"),
);

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    country: v.optional(countryValidator),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
    active: v.optional(v.boolean()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
    hoursPerDay: v.optional(v.number()),
    workdays: v.optional(v.array(v.number())),
    workStart: v.optional(v.string()),
    workEnd: v.optional(v.string()),
  }).index("email", ["email"]),

  settings: defineTable({
    key: v.literal("main"),
    hoursPerDay: v.number(),
    allowedDomains: v.array(v.string()),
    allowAnyDomain: v.boolean(),
    holidaysLoaded: v.boolean(),
    shareToken: v.optional(v.string()),
  }).index("by_key", ["key"]),

  holidays: defineTable({
    date: v.string(),
    country: countryValidator,
    name: v.string(),
    source: v.union(v.literal("oficial"), v.literal("manual")),
  })
    .index("by_country", ["country"])
    .index("by_country_date", ["country", "date"]),

  absences: defineTable({
    userId: v.id("users"),
    date: v.string(),
    reason: v.string(),
    discountsCapacity: v.boolean(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_date", ["date"]),

  items: defineTable({
    userId: v.id("users"),
    year: v.number(),
    month: v.number(),
    tipo: tipoValidator,
    name: v.string(),
    ticket: v.union(v.string(), v.null()),
    deployDate: v.union(v.string(), v.null()),
    environment: v.union(v.string(), v.null()),
    notes: v.union(v.string(), v.null()),
    endedOn: v.optional(v.union(v.string(), v.null())),
    relatedKind: v.optional(
      v.union(v.literal("requerimiento"), v.literal("incidente"), v.literal("service"), v.null()),
    ),
    relatedTicket: v.optional(v.union(v.string(), v.null())),
    outcome: v.optional(
      v.union(v.literal("exitoso"), v.literal("no_exitoso"), v.literal("rollback"), v.null()),
    ),
    sortOrder: v.number(),
  })
    .index("by_user_period", ["userId", "year", "month"])
    .index("by_period", ["year", "month"]),

  entries: defineTable({
    itemId: v.id("items"),
    userId: v.id("users"),
    date: v.string(),
    hours: v.number(),
    extraHours: v.optional(v.number()),
  })
    .index("by_item_date", ["itemId", "date"])
    .index("by_user_date", ["userId", "date"])
    .index("by_date", ["date"]),
});
