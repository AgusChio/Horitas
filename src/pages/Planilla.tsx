import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TIPO_META, TIPO_ORDER, type Tipo } from "../../convex/domain";
import { longDate, monthTitle, scheduleSummary } from "../../convex/dates";
import { Button, ConfirmDialog, Field, Modal, Select, TextInput } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { countryFlag, countryName, formatHours, hoursToInput, parseHours } from "../lib/format";

const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

type Board = NonNullable<FunctionReturnType<typeof api.board.get>>;
type BoardItem = Board["items"][number];

export function Planilla({
  year,
  month,
  userId,
  onToast,
  onError,
}: {
  year: number;
  month: number;
  userId: Id<"users">;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const board = useQuery(api.board.get, { year, month, userId });
  const startMonth = useMutation(api.items.startMonth);
  const copyPrevious = useMutation(api.items.copyPrevious);
  const setHours = useMutation(api.items.setHours);
  const [filter, setFilter] = useState<"todos" | Tipo>("todos");
  const [entryKind, setEntryKind] = useState<"regular" | "extra">("regular");
  const [dialog, setDialog] = useState<
    { mode: "create"; tipo: Tipo } | { mode: "edit"; item: BoardItem } | null
  >(null);

  async function run(action: () => Promise<unknown>, empty: string, done: string) {
    try {
      const result = await action();
      onToast(typeof result === "number" && result === 0 ? empty : done);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  if (board === undefined) return <p className="text-sm text-ink-soft">Cargando la planilla…</p>;
  if (board === null) return <p className="text-sm">No encontré la planilla de esta persona.</p>;

  const visible = board.items.filter((item) => filter === "todos" || item.tipo === filter);
  const ratio = board.capacity.totalHours
    ? Math.min(100, Math.round((board.executed / board.capacity.totalHours) * 100))
    : 0;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">
            {countryFlag(board.person.country)} {board.person.name} · {countryName(board.person.country)}
          </p>
          <h2 className="font-display text-4xl leading-none">{monthTitle(year, month)}</h2>
          {board.person.countryMissing && (
            <p className="mt-2 text-sm text-copper-dark">
              Falta el país de esta persona. Hasta definirlo, se usan los feriados de Argentina.
            </p>
          )}
        </div>
        <div className="min-w-64 flex-1 sm:max-w-sm">
          <div className="mb-1 flex justify-between text-sm">
            <span>{formatHours(board.executed, "0")} h cargadas</span>
            <span className="text-ink-soft">de {formatHours(board.capacity.totalHours, "0")} h</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-copper" style={{ width: `${ratio}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {board.capacity.businessDays} días de jornada · {formatHours(board.capacity.availableHours, "0")} h
            disponibles
            {board.capacity.discountHours > 0 &&
              ` · descuento ${formatHours(board.capacity.discountHours, "0")} h`}
            {board.extra > 0 && ` · ${formatHours(board.extra, "0")} h extras`}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {scheduleSummary(board.schedule.workdays, board.hoursPerDay)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          className="h-10 w-full gap-1.5 sm:w-auto"
          onClick={() => setDialog({ mode: "create", tipo: "requerimiento" })}
        >
          <PlusIcon />
          Agregar ítem
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full sm:w-auto"
          onClick={() =>
            void run(
              () => startMonth({ userId, year, month }),
              "Este mes ya tiene ítems.",
              "Quedaron cargadas la bandeja y la gestión.",
            )
          }
        >
          Empezar el mes
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full sm:w-auto"
          onClick={() =>
            void run(
              () => copyPrevious({ userId, year, month }),
              "El mes anterior no tiene ítems nuevos.",
              "Se copiaron los ítems del mes anterior.",
            )
          }
        >
          Copiar mes anterior
        </Button>
        <div className="flex rounded-full border border-line bg-card p-1">
          {(
            [
              ["regular", "Jornada"],
              ["extra", "Horas extras"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={entryKind === value}
              onClick={() => setEntryKind(value)}
              className={`h-8 flex-1 rounded-full px-3 text-sm font-semibold sm:flex-none ${entryKind === value ? "bg-inverse text-on-inverse" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Select
          pill
          className="sm:ml-auto sm:w-56"
          label="Filtrar por tipo"
          value={filter}
          onChange={(value) => {
            if (value === "todos" || (TIPO_ORDER as readonly string[]).includes(value)) {
              setFilter(value as "todos" | Tipo);
            }
          }}
          options={[
            { value: "todos", label: "Todos los ítems" },
            ...TIPO_ORDER.map((tipo) => ({ value: tipo, label: TIPO_META[tipo].label })),
          ]}
        />
      </div>
      {entryKind === "extra" && (
        <p className="mb-3 rounded-2xl bg-peach/70 px-3 py-2 text-sm">
          Estás cargando horas extras. Se suman al ítem y no descuentan la capacidad de la jornada.
        </p>
      )}

      {board.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-14 text-center">
          <h3 className="font-display text-3xl">Este mes está vacío</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Empezá con bandeja y gestión, copiá los ítems del mes anterior o cargá un PR, un PPM o un
            despliegue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {board.weeks.map((week, weekIndex) => {
            const days = board.days.filter((day) => day.week === week.n);
            const weekHours = visible.reduce((sum, item) => sum + (item.weeks[weekIndex] ?? 0), 0);
            const weekExtra = visible.reduce((sum, item) => sum + (item.extraWeeks[weekIndex] ?? 0), 0);
            const notes = days.flatMap((day) => {
              const bits = [
                day.holidayName ? `${day.day} · ${day.holidayName}` : null,
                day.infoHoliday ? `${day.day} · Colombia: ${day.infoHoliday}` : null,
                day.absence ? `${day.day} · Ausencia: ${day.absence.reason}` : null,
              ];
              return bits.filter((bit): bit is string => Boolean(bit));
            });
            return (
              <article key={week.n} className="week-card">
                <header className="flex items-center gap-3 border-b border-line bg-sheet-soft px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-inverse text-sm font-semibold text-on-inverse">
                    S{week.n}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{weekRange(week.start, week.end)}</p>
                    {notes.length > 0 && (
                      <p className="truncate text-xs text-ink-soft">{notes.join(" · ")}</p>
                    )}
                  </div>
                  <p className="ml-auto shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatHours(weekHours, "0")} h
                    {weekExtra > 0 && (
                      <span className="block text-xs font-semibold text-copper-dark">
                        +{formatHours(weekExtra, "0")} extra
                      </span>
                    )}
                  </p>
                </header>
                <div className="week-scroll">
                  <div className="grid" style={{ gridTemplateColumns: weekColumns(days.length) }}>
                    <div className="border-r border-b border-sheet-line bg-sheet-head px-3 py-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                      Ítem
                    </div>
                    {days.map((day) => (
                      <div
                        key={day.date}
                        title={columnTitle(day)}
                        className={`flex flex-col items-center justify-center border-r border-b border-sheet-line px-1 py-2 text-center ${dayTone(day)}`}
                      >
                        <span className={`text-[11px] font-semibold tracking-wide ${day.absence ? "text-rose-800" : "text-ink-soft"}`}>
                          {WEEKDAY_NAMES[day.dow]}
                        </span>
                        <span className={`text-base leading-none font-semibold tabular-nums ${day.absence ? "text-rose-800" : ""}`}>
                          {day.day}
                        </span>
                        {day.infoHoliday && !day.holidayName && (
                          <span className="text-[9px] font-semibold tracking-wide text-ink-soft">CO</span>
                        )}
                      </div>
                    ))}
                    <div className="border-b border-sheet-line bg-sheet-head px-2 py-2 text-center text-xs font-semibold tracking-wide text-ink-soft uppercase">
                      Total
                    </div>

                    {visible.map((item, rowIndex) => (
                      <WeekRow
                        key={item._id}
                        item={item}
                        days={days}
                        weekIndex={weekIndex}
                        rowIndex={rowIndex}
                        rowCount={visible.length}
                        onEdit={() => setDialog({ mode: "edit", item })}
                        kind={entryKind}
                        onCommit={(date, hours) => saveHours(setHours, item._id, date, hours, entryKind, onError)}
                        onInvalid={() => onError("Las horas tienen que estar entre 0 y 24.")}
                      />
                    ))}

                    <div className="border-r border-sheet-line bg-sheet-head px-3 py-3 text-sm font-semibold">
                      Total del día
                    </div>
                    {days.map((day) => {
                      const total = visible.reduce((sum, item) => sum + (item.hours[day.day - 1] ?? 0), 0);
                      const extra = visible.reduce((sum, item) => sum + (item.extras[day.day - 1] ?? 0), 0);
                      const over = day.isWorkday ? total > board.hoursPerDay : total > 0;
                      return (
                        <div
                          key={day.date}
                          title={
                            over
                              ? day.isWorkday
                                ? `Supera la jornada de ${board.hoursPerDay} h`
                                : "Ese día no es de tu jornada. Conviene cargarlo como extra."
                              : undefined
                          }
                          className={`grid place-items-center border-r border-sheet-line text-sm font-semibold tabular-nums ${dayTone(day)} ${over ? "text-rose-700" : ""}`}
                        >
                          <span>{formatHours(entryKind === "extra" ? extra : total)}</span>
                          {extra > 0 && entryKind === "regular" && (
                            <span className="text-[10px] text-copper-dark">+{formatHours(extra)}</span>
                          )}
                        </div>
                      );
                    })}
                    <div className="grid place-items-center bg-sheet-head text-sm font-semibold tabular-nums">
                      {formatHours(entryKind === "extra" ? weekExtra : weekHours, "0")}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft">
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-weekend" />
          Fin de semana
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-holiday" />
          Feriado
        </li>
        <li>CO en el día: feriado en Colombia, solo para saberlo. No resta la jornada argentina.</li>
        <li className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded bg-sheet shadow-[inset_0_0_0_2px_var(--color-copper)]" />
          Despliegue
        </li>
        <li>Lo que pasa de la jornada de {formatHours(board.hoursPerDay, "0")} h, o cae en un día que no trabajás, queda en rojo.</li>
      </ul>

      {dialog && (
        <ItemDialog
          year={year}
          month={month}
          userId={userId}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onError={onError}
        />
      )}
    </section>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

type BoardDay = Board["days"][number];

function weekRange(start: number, end: number) {
  if (start === end) return `Día ${start}`;
  return `Días ${start} al ${end}`;
}

function weekColumns(count: number) {
  return `minmax(16.5rem, 1.2fr) repeat(${count}, minmax(4.25rem, 1fr)) 4.75rem`;
}

function dayTone(day: BoardDay) {
  if (day.holidayName) return "bg-holiday";
  if (day.isWeekend) return "bg-weekend";
  return "bg-sheet";
}

function columnTitle(day: BoardDay) {
  return [
    day.holidayName,
    day.infoHoliday ? `En Colombia: ${day.infoHoliday}. No resta la jornada.` : null,
    day.absence
      ? `Ausencia: ${day.absence.reason}${day.absence.discountsCapacity ? " (resta capacidad)" : ""}`
      : null,
    day.isWeekend ? "Fin de semana" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function WeekRow({
  item,
  days,
  weekIndex,
  rowIndex,
  rowCount,
  kind,
  onEdit,
  onCommit,
  onInvalid,
}: {
  item: BoardItem;
  days: BoardDay[];
  weekIndex: number;
  rowIndex: number;
  rowCount: number;
  kind: "regular" | "extra";
  onEdit: () => void;
  onCommit: (date: string, hours: number) => Promise<unknown>;
  onInvalid: () => void;
}) {
  const meta = TIPO_META[item.tipo];
  const values = kind === "extra" ? item.extras : item.hours;
  const weekTotal = kind === "extra" ? (item.extraWeeks[weekIndex] ?? 0) : (item.weeks[weekIndex] ?? 0);
  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5 border-r border-b border-sheet-line bg-sheet px-3 py-2">
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: meta.dot }} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit} title={item.notes ?? "Editar ítem"}>
          <span className="block truncate text-sm font-semibold">{item.name}</span>
          <span className="block truncate text-xs text-ink-soft">
            {meta.asignacion}
            {item.ticket ? ` · ${item.ticket}` : ""}
            {item.environment ? ` · ${item.environment}` : ""}
          </span>
        </button>
      </div>
      {days.map((day, colIndex) => {
        const value = values[day.day - 1] ?? 0;
        return (
          <div key={day.date} title={columnTitle(day)} className={`border-r border-b border-sheet-line ${dayTone(day)}`}>
            <HourCell
              week={weekIndex}
              row={rowIndex}
              col={colIndex}
              rowCount={rowCount}
              value={value}
              extra={kind === "extra"}
              label={`${kind === "extra" ? "Horas extras" : "Horas"} del ${day.day} en ${item.name}`}
              marked={item.deployDate === day.date}
              onCommit={(hours) => onCommit(day.date, hours)}
              onInvalid={onInvalid}
            />
          </div>
        );
      })}
      <div className="grid place-items-center border-b border-sheet-line bg-sheet-soft text-sm font-semibold tabular-nums">
        {formatHours(weekTotal)}
      </div>
    </>
  );
}

function HourCell({
  week,
  row,
  col,
  rowCount,
  value,
  extra,
  label,
  marked,
  onCommit,
  onInvalid,
}: {
  week: number;
  row: number;
  col: number;
  rowCount: number;
  value: number;
  extra: boolean;
  label: string;
  marked: boolean;
  onCommit: (hours: number) => Promise<unknown>;
  onInvalid: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      aria-label={label}
      data-week={week}
      data-row={row}
      data-col={col}
      value={draft ?? hoursToInput(value)}
      inputMode="decimal"
      onFocus={(event) => {
        setDraft(hoursToInput(value));
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const raw = event.currentTarget.value;
        setDraft(null);
        const parsed = parseHours(raw);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
          onInvalid();
          return;
        }
        const rounded = Math.round(parsed * 4) / 4;
        if (rounded !== value) void onCommit(rounded);
      }}
      onKeyDown={(event) => {
        const move: Record<string, [number, number]> = {
          Enter: [1, 0],
          ArrowDown: [1, 0],
          ArrowUp: [-1, 0],
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
        };
        const delta = move[event.key];
        if (!delta) return;
        event.preventDefault();
        focusHour(week, row + delta[0], col + delta[1], rowCount);
      }}
      className={`hour-input ${value > 0 ? "font-semibold" : ""} ${extra ? "is-extra" : ""} ${marked ? "is-deploy" : ""}`}
    />
  );
}

function focusHour(week: number, row: number, col: number, rowCount: number) {
  if (row < 0 || row >= rowCount) return;
  const exact = document.querySelector<HTMLInputElement>(
    `[data-week="${week}"][data-row="${row}"][data-col="${col}"]`,
  );
  if (exact) {
    exact.focus();
    return;
  }
  if (col < 0) {
    const previous = [
      ...document.querySelectorAll<HTMLInputElement>(`[data-week="${week - 1}"][data-row="${row}"]`),
    ];
    previous.at(-1)?.focus();
    return;
  }
  document
    .querySelector<HTMLInputElement>(`[data-week="${week + 1}"][data-row="${row}"][data-col="0"]`)
    ?.focus();
}

function saveHours(
  setHours: (args: {
    itemId: Id<"items">;
    date: string;
    hours: number;
    kind: "regular" | "extra";
  }) => Promise<unknown>,
  itemId: Id<"items">,
  date: string,
  hours: number,
  kind: "regular" | "extra",
  onError: (message: string) => void,
) {
  return setHours({ itemId, date, hours, kind }).catch((error: unknown) => onError(errorMessage(error)));
}

function ItemDialog({
  year,
  month,
  userId,
  dialog,
  onClose,
  onError,
}: {
  year: number;
  month: number;
  userId: Id<"users">;
  dialog: { mode: "create"; tipo: Tipo } | { mode: "edit"; item: BoardItem };
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const create = useMutation(api.items.create);
  const update = useMutation(api.items.update);
  const remove = useMutation(api.items.remove);
  const move = useMutation(api.items.move);
  const initial = dialog.mode === "edit" ? dialog.item : null;
  const startingTipo = dialog.mode === "create" ? dialog.tipo : dialog.item.tipo;
  const [tipo, setTipo] = useState<Tipo>(startingTipo);
  const [name, setName] = useState(initial?.name ?? "");
  const [ticket, setTicket] = useState(initial?.ticket ?? "");
  const [deployDate, setDeployDate] = useState(initial?.deployDate ?? "");
  const [environment, setEnvironment] = useState(initial?.environment ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [askDelete, setAskDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const meta = TIPO_META[tipo];
  const ticketMode = tipo === "problema" || tipo === "requerimiento" ? "required" : tipo === "bandeja" || tipo === "despliegue" ? "optional" : "hidden";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const payload = {
      tipo,
      name,
      ticket,
      deployDate,
      environment,
      notes,
    };
    try {
      if (initial) await update({ itemId: initial._id, ...payload });
      else await create({ userId, year, month, ...payload });
      onClose();
    } catch (caught) {
      onError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <Modal
      title={initial ? "Editar ítem" : "Nuevo ítem"}
      subtitle={`${meta.label} · se suma en ${meta.asignacion}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Tipo">
          <Select
            value={tipo}
            onChange={(value) => setTipo(value as Tipo)}
            options={TIPO_ORDER.map((option) => ({
              value: option,
              label: `${TIPO_META[option].label} — ${TIPO_META[option].description}`,
            }))}
          />
        </Field>
        <Field
          label="Nombre"
          hint={
            tipo === "bandeja"
              ? "Si lo dejás vacío, queda como Incidentes & Service Request."
              : tipo === "gestion"
                ? "Si lo dejás vacío, queda como Gestión."
                : undefined
          }
        >
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={placeholderFor(tipo)}
          />
        </Field>
        {ticketMode !== "hidden" && (
          <Field
            label={tipo === "problema" ? "Número de PR" : tipo === "requerimiento" ? "Número de PPM" : "Ticket"}
            hint={ticketMode === "optional" ? "Opcional. Podés poner INC, SR o el número que usen." : undefined}
          >
            <TextInput
              value={ticket ?? ""}
              onChange={(event) => setTicket(event.target.value)}
              required={ticketMode === "required"}
              placeholder={tipo === "problema" ? "PR-961" : tipo === "requerimiento" ? "PPM-5528" : "INC-1024"}
            />
          </Field>
        )}
        {tipo === "despliegue" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <TextInput type="date" value={deployDate ?? ""} onChange={(event) => setDeployDate(event.target.value)} />
            </Field>
            <Field label="Ambiente">
              <Select
                value={environment ?? ""}
                onChange={setEnvironment}
                options={[
                  { value: "", label: "Sin definir" },
                  { value: "Desarrollo", label: "Desarrollo" },
                  { value: "QA", label: "QA" },
                  { value: "Producción", label: "Producción" },
                ]}
              />
            </Field>
          </div>
        )}
        <Field label="Nota">
          <TextInput value={notes ?? ""} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {initial && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  void move({ itemId: initial._id, direction: "up" }).catch((caught) => onError(errorMessage(caught)))
                }
              >
                Subir
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  void move({ itemId: initial._id, direction: "down" }).catch((caught) => onError(errorMessage(caught)))
                }
              >
                Bajar
              </Button>
              <Button type="button" variant="danger" onClick={() => setAskDelete(true)}>
                Eliminar
              </Button>
            </>
          )}
        </div>
        {askDelete && initial && (
          <ConfirmDialog
            title="Eliminar ítem"
            body={`Se borra ${initial.name} y las horas cargadas en este mes.`}
            confirmLabel="Eliminar"
            pending={pending}
            onClose={() => setAskDelete(false)}
            onConfirm={() => {
              setPending(true);
              void remove({ itemId: initial._id })
                .then(onClose)
                .catch((caught) => {
                  setPending(false);
                  setAskDelete(false);
                  onError(errorMessage(caught));
                });
            }}
          />
        )}
        {initial?.deployDate && (
          <p className="text-xs text-ink-soft">Despliegue marcado el {longDate(initial.deployDate)}.</p>
        )}
      </form>
    </Modal>
  );
}

function placeholderFor(tipo: Tipo) {
  if (tipo === "problema") return "Error en proceso Conciliación pagos";
  if (tipo === "requerimiento") return "Optimización Cierre de Ingresos";
  if (tipo === "despliegue") return "Salida de cierre";
  if (tipo === "cierre") return "Cierre financiero";
  return "";
}
