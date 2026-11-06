import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "")
          .trim()
          .toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new ConvexError("Ingresá un mail válido.");
        }
        const profile: { email: string; name?: string; country?: string } = { email };
        if (String(params.flow ?? "") === "signUp") {
          const name = String(params.name ?? "").trim().replace(/\s+/g, " ");
          if (name.length < 3) throw new ConvexError("Completá tu nombre y apellido.");
          if (params.country !== "AR" && params.country !== "CO") {
            throw new ConvexError("Elegí si estás en Argentina o en Colombia.");
          }
          profile.name = name;
          profile.country = params.country;
        }
        return profile;
      },
      validatePasswordRequirements(password: string) {
        if (password.length < 8) {
          throw new ConvexError("La contraseña necesita al menos 8 caracteres.");
        }
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(untypedCtx, args) {
      const ctx = untypedCtx as MutationCtx;
      if (args.existingUserId) return args.existingUserId;

      const profile = args.profile as {
        email?: string;
        name?: string;
        country?: string;
      };
      const email = String(profile.email ?? "").toLowerCase();
      const existing = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
      if (existing) return existing._id;

      const anyUser = await ctx.db.query("users").first();
      if (anyUser) {
        const settings = await ctx.db
          .query("settings")
          .withIndex("by_key", (q) => q.eq("key", "main"))
          .unique();
        if (!settings?.allowAnyDomain) {
          const domains = settings?.allowedDomains ?? [];
          const domain = email.split("@")[1] ?? "";
          if (domains.length === 0) {
            throw new ConvexError(
              "Pedile a quien administra el equipo que habilite el dominio del mail corporativo.",
            );
          }
          if (!domains.includes(domain)) {
            throw new ConvexError("Ese mail no pertenece a un dominio habilitado.");
          }
        }
      }

      const country = profile.country === "CO" ? "CO" : profile.country === "AR" ? "AR" : null;
      if (!country) throw new ConvexError("Elegí si estás en Argentina o en Colombia.");
      const name = profile.name?.trim();
      if (!name) throw new ConvexError("Completá tu nombre y apellido.");

      return await ctx.db.insert("users", {
        email,
        name,
        country,
        role: anyUser ? "member" : "admin",
        active: true,
      });
    },
  },
});
