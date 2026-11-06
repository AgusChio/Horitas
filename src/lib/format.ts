export function formatHours(value: number, zero = "–") {
  if (!value) return zero;
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

export function parseHours(text: string) {
  const clean = text.trim();
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized);
}

export function hoursToInput(value: number) {
  if (!value) return "";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

export function countryName(country: "AR" | "CO" | null | undefined) {
  if (country === "CO") return "Colombia";
  if (country === "AR") return "Argentina";
  return "Sin país";
}

export function countryFlag(country: "AR" | "CO" | null | undefined) {
  if (country === "CO") return "🇨🇴";
  if (country === "AR") return "🇦🇷";
  return "·";
}
