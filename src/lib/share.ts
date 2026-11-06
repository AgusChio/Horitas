export function shareUrl(
  token: string,
  year: number,
  month: number,
  range?: { start: string; end: string; group: string },
) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("informe", token);
  url.searchParams.set("mes", `${year}-${String(month).padStart(2, "0")}`);
  if (range) {
    url.searchParams.set("desde", range.start);
    url.searchParams.set("hasta", range.end);
    url.searchParams.set("grupo", range.group);
  }
  return url.toString();
}

export function readShare() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("informe");
  if (!token || !/^[a-f0-9]{32,64}$/.test(token)) return null;
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const mes = params.get("mes")?.match(/^(\d{4})-(\d{2})$/);
  if (mes) {
    const parsedYear = Number(mes[1]);
    const parsedMonth = Number(mes[2]);
    if (parsedYear >= 2020 && parsedYear <= 2100 && parsedMonth >= 1 && parsedMonth <= 12) {
      year = parsedYear;
      month = parsedMonth;
    }
  }
  return { token, year, month };
}
