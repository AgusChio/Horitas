import { ConvexError } from "convex/values";

export function errorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : "No se pudo completar la acción.";
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const embedded = raw.match(/Uncaught ConvexError:\s*([\s\S]+)$/);
  if (embedded) {
    const body = embedded[1].trim();
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed === "string") return parsed;
    } catch {
      return body.replace(/^["']|["']$/g, "");
    }
  }
  if (/invalid credentials|invalid password|invalid secret/i.test(raw)) {
    return "Mail o contraseña incorrectos.";
  }
  if (/already exists/i.test(raw)) {
    return "Ese mail ya tiene cuenta. Entrá con tu contraseña.";
  }
  if (raw && !raw.includes("[CONVEX") && !raw.includes("Server Error")) return raw;
  return "No se pudo completar la acción.";
}
