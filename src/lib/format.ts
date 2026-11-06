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

export function formatDay(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function parseDay(text: string) {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const day = match[1]?.padStart(2, "0");
  const month = match[2]?.padStart(2, "0");
  const iso = `${match[3]}-${month}-${day}`;
  const parsed = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parsed) return "";
  const year = Number(parsed[1]);
  const monthNumber = Number(parsed[2]);
  const dayNumber = Number(parsed[3]);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1) return "";
  const last = new Date(year, monthNumber, 0).getDate();
  if (dayNumber > last) return "";
  return iso;
}

export function maskDay(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
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
