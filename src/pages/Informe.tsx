import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { isIsoDate, monthBounds, monthTitle, rangeProblem, scheduleSummary, shiftMonth, type RangeGroup } from "../../convex/dates";
import { ReportTools } from "../components/ReportTools";
import { ErrorDialog } from "../components/ui";
import { downloadExcel, downloadWord } from "../lib/exportReport";
import { errorMessage } from "../lib/errors";
import { countryFlag, countryName, formatHours } from "../lib/format";
import { TeamCharts } from "./Graficos";

function initialRange(year: number, month: number) {
  const params = new URLSearchParams(window.location.search);
  const bounds = monthBounds(year, month);
  const since = params.get("desde");
  const until = params.get("hasta");
  const group = params.get("grupo");
  return {
    start: since && isIsoDate(since) ? since : bounds.start,
    end: until && isIsoDate(until) ? until : bounds.end,
    group: group === "mes" || group === "dia" || group === "semana" ? group : ("semana" as RangeGroup),
  };
}

export function Informe({
  token,
  year,
  month,
}: {
  token: string;
  year: number;
  month: number;
}) {
  const opening = initialRange(year, month);
  const [period, setPeriod] = useState({ year, month });
  const [start, setStart] = useState(opening.start);
  const [end, setEnd] = useState(opening.end);
  const [group, setGroup] = useState<RangeGroup>(opening.group);
  const [mode, setMode] = useState<"semana" | "acumulado">("semana");
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [exporting, setExporting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const rangeIssue = rangeProblem(start, end, group);
  const report = useQuery(api.board.sharedRange, rangeIssue ? "skip" : { token, start, end, group });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("informe", token);
    params.set("mes", `${period.year}-${String(period.month).padStart(2, "0")}`);
    params.set("desde", start);
    params.set("hasta", end);
    params.set("grupo", group);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    document.title = `Horitas · ${monthTitle(period.year, period.month)}`;
  }, [end, group, period.month, period.year, start, token]);

  function moveMonth(step: number) {
    const next = shiftMonth(period.year, period.month, step);
    const bounds = monthBounds(next.year, next.month);
    setPeriod(next);
    setStart(bounds.start);
    setEnd(bounds.end);
  }

  async function download(kind: "excel" | "word") {
    if (!report || report.executed <= 0) return;
    setExporting(true);
    try {
      const label = `${start} a ${end}`;
      if (kind === "excel") await downloadExcel(report, label);
      else await downloadWord(report, label);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("horas.theme", next ? "dark" : "light");
    setDark(next);
  }

  const regular = report?.people.reduce((sum, person) => sum + person.regular, 0) ?? 0;
  const extra = report?.people.reduce((sum, person) => sum + person.extra, 0) ?? 0;

  return (
    <div className="min-h-screen">
      <header className="app-bar sticky top-0 z-30 border-b border-line bg-card px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3">
          <div className="mr-auto min-w-0">
            <p className="font-display text-3xl leading-none">Horitas</p>
            <p className="text-xs text-ink-soft">Solo lectura · todo el equipo</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-lg leading-none"
              aria-label="Mes anterior"
              onClick={() => moveMonth(-1)}
            >
              ‹
            </button>
            <p className="hidden min-w-36 text-center text-sm font-semibold capitalize sm:block">
              {monthTitle(period.year, period.month)}
            </p>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-lg leading-none"
              aria-label="Mes siguiente"
              onClick={() => moveMonth(1)}
            >
              ›
            </button>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-ink"
            aria-label={dark ? "Usar modo claro" : "Usar modo oscuro"}
            onClick={toggleTheme}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-5 px-4 py-5 md:px-6">
        <div>
          <h2 className="font-display text-4xl leading-none">{monthTitle(period.year, period.month)}</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Gráficos de todas las personas del equipo, en una sola hoja. Desde acá no se cargan ni se modifican horas.
          </p>
        </div>

        <ReportTools
          start={start}
          end={end}
          group={group}
          canDownload={!!report && report.executed > 0}
          busy={exporting}
          onStart={setStart}
          onEnd={setEnd}
          onGroup={setGroup}
          onExcel={() => void download("excel")}
          onWord={() => void download("word")}
        />
        {rangeIssue && <p className="text-sm text-copper-dark">{rangeIssue}</p>}
        {!rangeIssue && report === undefined && <p className="text-sm text-ink-soft">Cargando el informe…</p>}
        {report === null && (
          <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
            <h3 className="font-display text-3xl">Este enlace no está disponible</h3>
            <p className="mt-2 text-sm text-ink-soft">Pedile a quien administra el equipo un enlace nuevo.</p>
          </div>
        )}

        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Capacidad" value={`${formatHours(report.capacityTotal, "0")} h`} />
              <Stat label="Jornada" value={`${formatHours(regular, "0")} h`} />
              <Stat label="Horas extras" value={`${formatHours(extra, "0")} h`} />
            </div>

            <div className="overflow-auto rounded-3xl border border-line bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-paper text-left text-xs tracking-wide text-ink-soft uppercase">
                  <tr>
                    <th className="px-4 py-3">Persona</th>
                    <th className="px-4 py-3">Jornada</th>
                    <th className="px-4 py-3">Capacidad</th>
                    <th className="px-4 py-3">Jornada</th>
                    <th className="px-4 py-3">Extras</th>
                    <th className="px-4 py-3">Restan</th>
                  </tr>
                </thead>
                <tbody>
                  {report.people.map((person) => (
                    <tr key={person._id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{person.name}</span>
                        <span className="block text-xs text-ink-soft">
                          {countryFlag(person.country)} {countryName(person.country)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {scheduleSummary(person.workdays, person.hoursPerDay)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatHours(person.totalHours, "0")} h</td>
                      <td className="px-4 py-3 tabular-nums">{formatHours(person.regular, "0")} h</td>
                      <td className="px-4 py-3 tabular-nums">{formatHours(person.extra, "0")} h</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {formatHours(person.totalHours - person.regular, "0")} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <TeamCharts
              report={report}
              personId="all"
              mode={mode}
              onMode={setMode}
              bucketTitle={group === "dia" ? "Día a día" : group === "mes" ? "Mes a mes" : "Semana a semana"}
              emptyHint="Cuando haya horas cargadas, los gráficos aparecen acá."
            />
          </>
        )}
        {problem && <ErrorDialog message={problem} onClose={() => setProblem(null)} />}
      </main>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M16.5 13.5A6.5 6.5 0 0 1 10 6.2 6.5 6.5 0 1 0 16.5 13.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-3xl border border-line bg-card px-4 py-4">
      <p className="text-xs tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none">{value}</p>
    </article>
  );
}
