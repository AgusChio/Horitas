import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../convex/_generated/api";
import { cumulative, longDate, monthBounds, monthTitle, rangeProblem, type RangeGroup } from "../../convex/dates";
import { OUTCOME_LABEL, RELATED_LABEL, TIPO_META, TIPO_ORDER, URGENCY_LABEL } from "../../convex/domain";
import { ReportTools } from "../components/ReportTools";
import { Button, Select } from "../components/ui";
import { downloadExcel, downloadWord } from "../lib/exportReport";
import { errorMessage } from "../lib/errors";
import { formatHours } from "../lib/format";
import { shareUrl } from "../lib/share";

export type TeamReport = NonNullable<FunctionReturnType<typeof api.board.teamMonth>>;

export function Graficos({
  year,
  month,
  isAdmin,
  onToast,
  onError,
}: {
  year: number;
  month: number;
  isAdmin: boolean;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const bounds = monthBounds(year, month);
  const [start, setStart] = useState(bounds.start);
  const [end, setEnd] = useState(bounds.end);
  const [group, setGroup] = useState<RangeGroup>("semana");
  const rangeIssue = rangeProblem(start, end, group);
  const report = useQuery(api.board.teamRange, rangeIssue ? "skip" : { start, end, group });
  const ensureShare = useMutation(api.team.ensureShare);
  const rotateShare = useMutation(api.team.rotateShare);
  const [personId, setPersonId] = useState("all");
  const [mode, setMode] = useState<"semana" | "acumulado">("semana");
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    setStart(bounds.start);
    setEnd(bounds.end);
  }, [bounds.start, bounds.end]);

  async function copyLink(rotate: boolean) {
    setSharing(true);
    try {
      const token = rotate ? await rotateShare() : await ensureShare();
      const url = shareUrl(token, year, month, { start, end, group });
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        onToast(
          rotate
            ? "Enlace nuevo copiado. El anterior ya no abre el informe."
            : "Enlace de solo lectura copiado.",
        );
      } catch {
        onToast("El enlace quedó debajo. Copialo desde ahí.");
      }
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setSharing(false);
    }
  }

  const period = `${start} a ${end}`;
  const visibleExecuted = report
    ? personId === "all"
      ? report.executed
      : report.people.filter((person) => person._id === personId).reduce((sum, person) => sum + person.executed, 0)
    : 0;

  async function download(kind: "excel" | "word") {
    if (!report || visibleExecuted <= 0) return;
    setExporting(true);
    try {
      const bucketTitle = group === "dia" ? "Día a día" : group === "mes" ? "Mes a mes" : "Semana a semana";
      if (kind === "excel") await downloadExcel(report, period, personId, mode, bucketTitle);
      else await downloadWord(report, period, personId, mode, bucketTitle);
      onToast(kind === "excel" ? "Excel descargado." : "Word descargado.");
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  if (report === null) return null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl leading-none">Gráficos</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">
            {monthTitle(year, month)}. Elegí un rango y miralo por semanas, meses o días.
          </p>
        </div>
        <ReportTools
          start={start}
          end={end}
          group={group}
          canDownload={visibleExecuted > 0}
          busy={exporting}
          onStart={setStart}
          onEnd={setEnd}
          onGroup={setGroup}
          onExcel={() => void download("excel")}
          onWord={() => void download("word")}
        />
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" variant="ghost" disabled={sharing} onClick={() => void copyLink(false)}>
            Copiar enlace de solo lectura
          </Button>
          {isAdmin && (
            <Button type="button" variant="ghost" disabled={sharing} onClick={() => void copyLink(true)}>
              Nuevo enlace
            </Button>
          )}
          <label className="text-sm font-semibold">
            Persona
            <Select
              className="mt-1 min-w-52"
              label="Persona"
              value={personId}
              onChange={setPersonId}
              options={[
                { value: "all", label: "Todo el equipo" },
                ...(report?.people ?? []).map((person) => ({ value: person._id, label: person.name })),
              ]}
            />
          </label>
        </div>
      </div>
      {link && (
        <p className="break-all rounded-2xl border border-line bg-card px-3 py-2 text-sm">{link}</p>
      )}
      {rangeIssue && <p className="text-sm text-copper-dark">{rangeIssue}</p>}
      {!rangeIssue && report === undefined && <p className="text-sm text-ink-soft">Cargando los gráficos…</p>}
      {report && (
        <TeamCharts
          report={report}
          personId={personId}
          mode={mode}
          onMode={setMode}
          bucketTitle={group === "dia" ? "Día a día" : group === "mes" ? "Mes a mes" : "Semana a semana"}
          note={
            group === "semana"
              ? "S1 a S" + report.weeks.length + " van de lunes a domingo dentro del mes. El acumulado suma cada columna con las anteriores."
              : "Cada columna sigue el rango elegido. El acumulado suma cada columna con las anteriores."
          }
        />
      )}
    </section>
  );
}

export function TeamCharts({
  report,
  personId,
  mode,
  onMode,
  bucketTitle = "Semana a semana",
  note,
  emptyHint = "Cuando completes la planilla, los gráficos aparecen acá.",
}: {
  report: TeamReport;
  personId: string;
  mode: "semana" | "acumulado";
  onMode: (mode: "semana" | "acumulado") => void;
  bucketTitle?: string;
  note?: string;
  emptyHint?: string;
}) {
  const view = useMemo(() => {
    const people = personId === "all" ? report.people : report.people.filter((person) => person._id === personId);
    const rows = personId === "all" ? report.rows : report.rows.filter((row) => row.userId === personId);
    const byTipo = TIPO_ORDER.map((tipo) => {
      const matching = rows.filter((row) => row.tipo === tipo);
      const weeks = report.weeks.map((_, index) =>
        matching.reduce((sum, row) => sum + (row.weeks[index] ?? 0), 0),
      );
      return {
        tipo,
        label: TIPO_META[tipo].asignacion,
        color: TIPO_META[tipo].dot,
        weeks,
        total: matching.reduce((sum, row) => sum + row.total, 0),
      };
    }).filter((row) => row.total > 0);
    const capacityInitial = people.reduce((sum, person) => sum + person.availableHours, 0);
    const capacityTotal = people.reduce((sum, person) => sum + person.totalHours, 0);
    const executed = people.reduce((sum, person) => sum + person.executed, 0);
    const deploys =
      personId === "all"
        ? report.deploys
        : report.deploys.filter((deploy) => deploy.userId === personId);
    const exitosos = deploys.filter((deploy) => deploy.outcome === "exitoso").length;
    const noExitosos = deploys.filter((deploy) => deploy.outcome === "no_exitoso").length;
    const pendientes = deploys.filter((deploy) => deploy.outcome === null).length;
    const urgentes = deploys.filter((deploy) => deploy.urgency === "urgente").length;
    const normales = deploys.filter((deploy) => deploy.urgency === "normal").length;
    const byPerson = people
      .map((person) => ({
        person,
        rows: rows.filter((row) => row.userId === person._id && row.total > 0),
      }))
      .filter((group) => group.rows.length > 0);
    return {
      people,
      rows,
      byPerson,
      byTipo,
      deploys,
      exitosos,
      noExitosos,
      pendientes,
      urgentes,
      normales,
      capacityInitial,
      capacityTotal,
      executed,
    };
  }, [personId, report]);

  const capacityData = [
    { name: "Inicial", horas: view.capacityInitial, fill: "#e7c7b0" },
    { name: "Total", horas: view.capacityTotal, fill: "#b7c6ea" },
    { name: "Ejecutadas", horas: view.executed, fill: "#c4622d" },
  ];
  const deployChartData = [
    { name: "Exitosos", cantidad: view.exitosos, fill: "#2f6f5e" },
    { name: "No exitosos (rollback)", cantidad: view.noExitosos, fill: "#9f3d3d" },
  ];
  const urgencyChartData = [
    { name: "Urgentes", cantidad: view.urgentes, fill: "#c4622d" },
    { name: "Normales", cantidad: view.normales, fill: "#3d7ea6" },
  ];
  const stacked = report.weeks.map((week, index) => {
    const point: Record<string, string | number> = {
      name: week.label || `S${week.n}`,
      rango: `${week.start}–${week.end}`,
    };
    for (const tipo of view.byTipo) point[tipo.label] = Math.round((tipo.weeks[index] ?? 0) * 100) / 100;
    return point;
  });
  const peopleData = view.people.map((person) => ({
    name: person.name,
    Capacidad: person.totalHours,
    Jornada: person.regular,
    Extras: person.extra,
  }));

  return (
    <div className="space-y-5">
      {view.executed === 0 && view.deploys.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-16 text-center">
          <h3 className="font-display text-3xl">Todavía no hay horas cargadas</h3>
          <p className="mt-2 text-sm text-ink-soft">{emptyHint}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Capacidad y ejecución">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={capacityData}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <Tooltip formatter={(value) => [`${value} h`, "Horas"]} />
                  <Bar dataKey="horas" radius={[8, 8, 0, 0]}>
                    {capacityData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Por tipo de asignación">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={view.byTipo} dataKey="total" nameKey="label" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {view.byTipo.map((entry) => (
                      <Cell key={entry.tipo} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} h`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Por persona">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peopleData}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <Tooltip formatter={(value) => [`${value} h`, ""]} />
                  <Legend />
                  <Bar dataKey="Capacidad" fill="#b7c6ea" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Jornada" fill="#c4622d" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Extras" fill="#e08a55" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title={bucketTitle} tall>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stacked}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <Tooltip formatter={(value, name) => [`${value} h`, name]} />
                <Legend />
                {view.byTipo.map((tipo) => (
                  <Bar key={tipo.tipo} dataKey={tipo.label} stackId="horas" fill={tipo.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-3xl">Despliegues</h3>
                <p className="text-xs text-ink-soft">
                  Discriminados entre exitosos y no exitosos (que requirieron rollback), y entre cambio urgente o normal.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-line bg-card px-3 py-1.5">
                  Total: {view.deploys.length}
                </span>
                <span className="rounded-full bg-[#2f6f5e]/15 px-3 py-1.5 text-[#2f6f5e]">
                  Exitosos: {view.exitosos}
                </span>
                <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-800">
                  No exitosos (rollback): {view.noExitosos}
                </span>
                {view.pendientes > 0 && (
                  <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-ink-soft">
                    Pendientes: {view.pendientes}
                  </span>
                )}
                <span className="rounded-full bg-[#c4622d]/15 px-3 py-1.5 text-[#c4622d]">
                  Urgentes: {view.urgentes}
                </span>
                <span className="rounded-full bg-[#3d7ea6]/15 px-3 py-1.5 text-[#3d7ea6]">
                  Normales: {view.normales}
                </span>
              </div>
            </div>

            {view.deploys.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center text-sm text-ink-soft">
                No hay despliegues registrados en este período.
              </div>
            ) : (
              <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Resultado de despliegues">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deployChartData} barCategoryGap="30%">
                      <CartesianGrid vertical={false} stroke="var(--color-line)" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                      <Tooltip formatter={(value) => [`${value}`, "Despliegues"]} />
                      <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                        {deployChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Tipo de cambio">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={urgencyChartData} barCategoryGap="30%">
                      <CartesianGrid vertical={false} stroke="var(--color-line)" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                      <Tooltip formatter={(value) => [`${value}`, "Despliegues"]} />
                      <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                        {urgencyChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

                <div className="overflow-auto rounded-3xl border border-line bg-card">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-paper text-left text-xs tracking-wide text-ink-soft uppercase">
                      <tr>
                        <th className="px-4 py-3">Cambio</th>
                        <th className="px-4 py-3">Relacionado con</th>
                        <th className="px-4 py-3">Ambiente</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Persona</th>
                        <th className="px-4 py-3">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.deploys.map((deploy) => {
                        const isSuccess = deploy.outcome === "exitoso";
                        return (
                          <tr key={deploy._id} className="border-t border-line">
                            <td className="px-4 py-3">
                              <span className="font-semibold">{deploy.ticket ?? deploy.name}</span>
                              {deploy.ticket && deploy.name !== deploy.ticket && (
                                <span className="block text-xs text-ink-soft">{deploy.name}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {deploy.relatedTicket ? (
                                <>
                                  <span className="font-semibold">{deploy.relatedTicket}</span>
                                  <span className="block text-xs text-ink-soft">
                                    {deploy.relatedName ??
                                      (deploy.relatedKind ? RELATED_LABEL[deploy.relatedKind] : "")}
                                  </span>
                                </>
                              ) : (
                                <span className="text-ink-soft">–</span>
                              )}
                            </td>
                            <td className="px-4 py-3">{deploy.environment ?? "–"}</td>
                            <td className="px-4 py-3">
                              {deploy.urgency ? (
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    deploy.urgency === "urgente"
                                      ? "bg-[#c4622d]/15 text-[#c4622d]"
                                      : "bg-[#3d7ea6]/15 text-[#3d7ea6]"
                                  }`}
                                >
                                  {URGENCY_LABEL[deploy.urgency]}
                                </span>
                              ) : (
                                <span className="text-ink-soft">–</span>
                              )}
                            </td>
                            <td className="px-4 py-3">{longDate(deploy.deployDate)}</td>
                            <td className="px-4 py-3">{deploy.personName}</td>
                            <td className="px-4 py-3">
                              {deploy.outcome ? (
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    isSuccess
                                      ? "bg-[#2f6f5e]/15 text-[#2f6f5e]"
                                      : "bg-rose-50 text-rose-800"
                                  }`}
                                >
                                  {OUTCOME_LABEL[deploy.outcome]}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink-soft">
                                  Pendiente
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-3xl">Detalle por persona</h3>
              <p className="text-xs text-ink-soft">
                Separado por cada integrante del equipo para leer las asignaciones sin mezclarlas.
              </p>
            </div>
            <div className="rounded-full bg-card p-1">
              {(
                [
                  ["semana", "De la semana"],
                  ["acumulado", "Acumulado"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onMode(value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${mode === value ? "bg-inverse text-on-inverse" : "text-ink-soft"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {view.byPerson.map(({ person, rows: personRows }) => {
              const personWeekTotals = report.weeks.map((_, index) =>
                personRows.reduce((sum, row) => sum + (row.weeks[index] ?? 0), 0),
              );
              const footerSeries =
                mode === "acumulado" ? cumulative(personWeekTotals) : personWeekTotals;
              const personTotal = personRows.reduce((sum, row) => sum + row.total, 0);

              return (
                <article
                  key={person._id}
                  className="overflow-hidden rounded-3xl border border-line bg-card"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sheet-soft px-4 py-3">
                    <div>
                      <h4 className="font-display text-2xl leading-none">{person.name}</h4>
                      <p className="mt-1 text-xs text-ink-soft">
                        Jornada: {formatHours(person.regular, "0")} h
                        {person.extra > 0 && ` · Extras: ${formatHours(person.extra, "0")} h`}
                        {` · Capacidad: ${formatHours(person.totalHours, "0")} h`}
                      </p>
                    </div>
                    <span className="rounded-full bg-inverse px-3 py-1 text-xs font-semibold text-on-inverse tabular-nums">
                      Total: {formatHours(personTotal, "0")} h
                    </span>
                  </header>
                  <div className="overflow-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="bg-paper text-left text-xs tracking-wide text-ink-soft uppercase">
                        <tr>
                          <th className="px-4 py-3">Ítem</th>
                          <th className="px-4 py-3">Asignación</th>
                          {report.weeks.map((week, index) => (
                            <th
                              key={`${week.label}-${index}`}
                              className="px-3 py-3"
                              title={`Días ${week.start} a ${week.end}`}
                            >
                              {week.label || `S${week.n}`}
                            </th>
                          ))}
                          <th className="px-4 py-3">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personRows.map((row) => {
                          const series = mode === "acumulado" ? cumulative(row.weeks) : row.weeks;
                          const caption = rowCaption(row);
                          return (
                            <tr key={`${row.itemId}-${row.ticket ?? row.name}`} className="border-t border-line">
                              <td className="px-4 py-3">
                                <span className="font-semibold">{row.name}</span>
                                {caption && (
                                  <span className="block text-xs text-ink-soft">{caption}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">{TIPO_META[row.tipo].asignacion}</td>
                              {series.map((hours, index) => (
                                <td key={`${row.itemId}-${index}`} className="px-3 py-3 tabular-nums">
                                  {formatHours(hours, "")}
                                </td>
                              ))}
                              <td className="px-4 py-3 font-semibold tabular-nums">
                                {formatHours(row.total, "0")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-line bg-sheet-head font-semibold">
                        <tr>
                          <td className="px-4 py-2.5" colSpan={2}>
                            Total {person.name}
                          </td>
                          {footerSeries.map((hours, index) => (
                            <td key={`total-${person._id}-${index}`} className="px-3 py-2.5 tabular-nums">
                              {formatHours(hours, "0")}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 tabular-nums">{formatHours(personTotal, "0")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="text-xs text-ink-soft">
            {note ?? `S1 a S${report.weeks.length} van de lunes a domingo. El acumulado suma cada semana con las anteriores.`}
          </p>
        </>
      )}
    </div>
  );
}

function rowCaption(row: TeamReport["rows"][number]) {
  const parts: string[] = [];
  if (row.ticket) parts.push(row.ticket);
  if (row.relatedTicket) {
    parts.push(
      row.relatedName
        ? `→ ${row.relatedTicket} (${row.relatedName})`
        : `→ ${row.relatedTicket}`,
    );
  }
  if (row.environment) parts.push(row.environment);
  if (row.urgency) parts.push(URGENCY_LABEL[row.urgency]);
  if (row.outcome) parts.push(OUTCOME_LABEL[row.outcome]);
  return parts.join(" · ");
}

function ChartCard({
  title,
  children,
  tall = false,
}: {
  title: string;
  children: ReactNode;
  tall?: boolean;
}) {
  return (
    <article className="rounded-3xl border border-line bg-card p-4">
      <h3 className="mb-2 font-display text-2xl">{title}</h3>
      <div className={tall ? "h-80" : "h-64"}>{children}</div>
    </article>
  );
}
