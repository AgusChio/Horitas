import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function getUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getUser(ctx);
  if (!user || user.active === false) {
    throw new ConvexError("Iniciá sesión para continuar.");
  }
  return user;
}

export function assertAdmin(user: Doc<"users">) {
  if (user.role !== "admin") {
    throw new ConvexError("Solo quien administra el equipo puede hacer este cambio.");
  }
}

export async function getSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
}

export function displayName(user: { name?: string; email?: string }) {
  const name = user.name?.trim();
  if (name) return name;
  return user.email ?? "Sin nombre";
}

export function assertPeriod(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ConvexError("Ese año no es válido.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ConvexError("Ese mes no es válido.");
  }
}
