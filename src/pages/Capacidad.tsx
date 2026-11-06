import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { longDate, monthBounds, monthTitle, scheduleSummary } from "../../convex/dates";
import { Button, ConfirmDialog, DateInput, Field, Modal, Select, Stat, TextInput } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { countryFlag, countryName, formatHours } from "../lib/format";

const BARS = [
  { key: "inicial", name: "Capacidad inicial", fill: "#e7c7b0" },
  { key: "total", name: "Capacidad total", fill: "#b7c6ea" },
  { key: "ejecutadas", name: "Ejecutadas", fill: "#c4622d" },
] as const;

export function Capacidad({
  year,
  month,
  onToast,
  onError,
}: {
  year: number;
  month: number;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const report = useQuery(api.board.teamMonth, { year, month });
  const addAbsence = useMutation(api.calendar.addAbsence);
  const updateAbsence = useMutation(api.calendar.updateAbsence);
  const removeAbsence = useMutation(api.calendar.removeAbsence);
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [discounts, setDiscounts] = useState(false);
  const [editing, setEditing] = useState<AbsenceEdit | null>(null);
  const [removing, setRemoving] = useState<AbsenceEdit | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  if (report === undefined) return <p className="text-sm text-ink-soft">Cargando la capacidad…</p>;
  if (report === null) return null;

  const bounds = monthBounds(year, month);
  const chart = [
    { name: "Inicial", horas: report.capacityInitial, fill: BARS[0].fill },
    { name: "Total", horas: report.capacityTotal, fill: BARS[1].fill },
    { name: "Ejecutadas", horas: report.executed, fill: BARS[2].fill },
  ];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) {
      onError("Elegí una persona.");
      return;
    }
    if (!date.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
      onError("Elegí un día de este mes.");
      return;
    }
    try {
      await addAbsence({
        userId: userId as Id<"users">,
        date,
        reason,
        discountsCapacity: discounts,
      });
      setReason("");
      setDate("");
      onToast("Ausencia guardada.");
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-display text-4xl leading-none">Capacidad</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {monthTitle(year, month)}. La capacidad usa los días y las horas de jornada de cada persona, y resta
          los feriados de su país. En Argentina, los de Colombia se listan aparte y no entran en la cuenta.
          La jornada base del equipo es de {report.hoursPerDay} h.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.15fr]">
        {report.countries.map((country) => (
          <article key={country.country} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-3xl">{countryName(country.country)}</h3>
              <span className="text-2xl" aria-hidden>
                {countryFlag(country.country)}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Metric label="Días hábiles" value={String(country.businessDays)} />
              <Metric label="Feriados" value={String(country.holidayCount)} />
              <Metric label="Ausencias" value={String(country.absenceCount)} />
            </dl>
            {country.holidayCount > country.weekdayHolidays && (
              <p className="mt-3 text-xs leading-5 text-ink-soft">
                {country.holidayCount - country.weekdayHolidays} caen en fin de semana y no restan
                capacidad.
              </p>
            )}
            <ul className="mt-4 space-y-1 text-sm">
              {country.holidayDetails.map((holiday) => (
                <li key={holiday.date}>
                  {longDate(holiday.date)} · {holiday.name}
                </li>
              ))}
              {country.holidayDetails.length === 0 && (
                <li className="text-ink-soft">No hay feriados este mes.</li>
              )}
            </ul>
            {country.country === "AR" && (
              <ColombiaNote countries={report.countries} />
            )}
          </article>
        ))}

        <article className="rounded-3xl border border-line bg-card p-4">
          <h3 className="font-display text-3xl">Equipo</h3>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--color-ink)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--color-ink-soft)", fontSize: 12 }} width={36} />
                <Tooltip
                  cursor={{ fill: "rgba(27,36,48,0.04)" }}
                  contentStyle={{ borderRadius: 12, borderColor: "#e4dccb", fontSize: 12 }}
                  formatter={(value) => [`${value} h`, "Horas"]}
                />
                <Bar dataKey="horas" radius={[8, 8, 0, 0]}>
                  {chart.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Capacidad inicial" value={`${formatHours(report.capacityInitial, "0")} h`} hint="Antes de ausencias" />
        <Stat label="Capacidad total" value={`${formatHours(report.capacityTotal, "0")} h`} hint="Después de descuentos" />
        <Stat
          label="Jornada"
          value={`${formatHours(report.people.reduce((sum, person) => sum + person.regular, 0), "0")} h`}
          hint="Horas de la jornada"
        />
        <Stat
          label="Horas extras"
          value={`${formatHours(report.people.reduce((sum, person) => sum + person.extra, 0), "0")} h`}
          hint="Fuera de la jornada"
        />
      </div>

      <div className="overflow-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-paper text-left text-xs tracking-wide text-ink-soft uppercase">
            <tr>
              {["Recurso", "País", "Disponibles", "Descuento", "Total", "Jornada", "Extras", "Restan"].map((head) => (
                <th key={head} className="px-4 py-3 font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.people.map((person) => {
              const left = person.totalHours - person.regular;
              return (
                <tr key={person._id} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">
                    {person.name}
                    <span className="block text-xs font-normal text-ink-soft">
                      {scheduleSummary(person.workdays, person.hoursPerDay)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {countryFlag(person.country)} {countryName(person.country)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatHours(person.availableHours, "0")}</td>
                  <td className="px-4 py-3 tabular-nums">{formatHours(person.discountHours, "0")}</td>
                  <td className="px-4 py-3 tabular-nums">{formatHours(person.totalHours, "0")}</td>
                  <td className="px-4 py-3 tabular-nums">{formatHours(person.regular, "0")}</td>
                  <td className="px-4 py-3 tabular-nums">{formatHours(person.extra, "0")}</td>
                  <td className={`px-4 py-3 tabular-nums ${left < 0 ? "font-semibold text-rose-700" : ""}`}>
                    {formatHours(left, "0")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-3xl border border-line bg-card p-4">
          <h3 className="font-display text-3xl">Detalle de ausencias</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {report.absences.length === 0 && <li className="text-ink-soft">No hay ausencias este mes.</li>}
            {report.absences.map((absence) => (
              <li key={absence._id} className="flex items-start justify-between gap-3 rounded-2xl bg-paper px-3 py-2">
                <span>
                  <strong>{longDate(absence.date)}</strong> · {absence.personName}
                  <span className="block text-ink-soft">
                    {absence.reason}
                    {absence.appliedHours > 0 ? ` · resta ${absence.appliedHours} h` : " · no resta capacidad"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-3">
                  <button type="button" className="text-xs font-semibold" onClick={() => setEditing(absence)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-800"
                    onClick={() => setRemoving(absence)}
                  >
                    Quitar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </article>

        <form onSubmit={onSubmit} className="space-y-3 rounded-3xl border border-line bg-card p-4">
          <h3 className="font-display text-3xl">Cargar ausencia</h3>
          <Field label="Persona">
            <Select
              value={userId}
              onChange={setUserId}
              options={[
                { value: "", label: "Elegir" },
                ...report.people.map((person) => ({ value: person._id, label: person.name })),
              ]}
            />
          </Field>
          <Field label="Día">
            <DateInput
              required
              min={bounds.start}
              max={bounds.end}
              value={date}
              onChange={setDate}
            />
          </Field>
          <Field
            label="Motivo"
            hint="Marcá la casilla para vacaciones o licencias. Un evento como Accenture Days puede quedar solo como registro."
          >
            <TextInput
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Accenture Days"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={discounts}
              onChange={(event) => setDiscounts(event.target.checked)}
              className="accent-copper"
            />
            Esta ausencia resta una jornada de la capacidad
          </label>
          <Button type="submit">Guardar ausencia</Button>
        </form>
      </div>
      {editing && (
        <AbsenceDialog
          absence={editing}
          year={year}
          month={month}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onToast("Ausencia actualizada.");
          }}
          onError={onError}
          onSave={(value) => updateAbsence({ absenceId: editing._id, ...value })}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Quitar ausencia"
          body={`Se quita la ausencia de ${removing.personName} del ${longDate(removing.date)}.`}
          confirmLabel="Quitar"
          pending={pendingDelete}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            setPendingDelete(true);
            void removeAbsence({ absenceId: removing._id })
              .then(() => {
                setRemoving(null);
                onToast("Ausencia quitada.");
              })
              .catch((caught) => onError(errorMessage(caught)))
              .finally(() => setPendingDelete(false));
          }}
        />
      )}
    </section>
  );
}

type AbsenceEdit = {
  _id: Id<"absences">;
  date: string;
  reason: string;
  discountsCapacity: boolean;
  personName: string;
};

function AbsenceDialog({
  absence,
  year,
  month,
  onClose,
  onSaved,
  onError,
  onSave,
}: {
  absence: AbsenceEdit;
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onSave: (value: { date: string; reason: string; discountsCapacity: boolean }) => Promise<unknown>;
}) {
  const bounds = monthBounds(year, month);
  const [date, setDate] = useState(absence.date);
  const [reason, setReason] = useState(absence.reason);
  const [discounts, setDiscounts] = useState(absence.discountsCapacity);
  const [pending, setPending] = useState(false);

  return (
    <Modal title="Editar ausencia" subtitle={absence.personName} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!date.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
            onError("Elegí un día de este mes.");
            return;
          }
          setPending(true);
          void onSave({ date, reason, discountsCapacity: discounts })
            .then(onSaved)
            .catch((caught) => {
              setPending(false);
              onError(errorMessage(caught));
            });
        }}
      >
        <Field label="Día">
          <DateInput required min={bounds.start} max={bounds.end} value={date} onChange={setDate} />
        </Field>
        <Field label="Motivo">
          <TextInput required value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={discounts}
            onChange={(event) => setDiscounts(event.target.checked)}
            className="accent-copper"
          />
          Esta ausencia resta una jornada de la capacidad
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </Modal>
  );
}

function ColombiaNote({
  countries,
}: {
  countries: {
    country: "AR" | "CO";
    holidayDetails: { date: string; name: string }[];
  }[];
}) {
  const argentina = new Set(
    countries.find((country) => country.country === "AR")?.holidayDetails.map((holiday) => holiday.date) ?? [],
  );
  const extra = (countries.find((country) => country.country === "CO")?.holidayDetails ?? []).filter(
    (holiday) => !argentina.has(holiday.date),
  );
  if (extra.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Colombia, solo para saber</p>
      <ul className="mt-2 space-y-1 text-sm text-ink-soft">
        {extra.map((holiday) => (
          <li key={holiday.date}>
            {longDate(holiday.date)} · {holiday.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper px-2 py-3">
      <dt className="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 font-display text-3xl">{value}</dd>
    </div>
  );
}
