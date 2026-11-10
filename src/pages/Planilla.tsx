import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  canClose,
  DEPLOY_ENVIRONMENTS,
  OUTCOME_LABEL,
  OUTCOMES,
  RELATED_KINDS,
  RELATED_LABEL,
  TIPO_META,
  TIPO_ORDER,
  type Outcome,
  type RelatedKind,
  type Tipo,
} from "../../convex/domain";
import { longDate, monthBounds, monthTitle, scheduleSummary } from "../../convex/dates";
import { Button, ConfirmDialog, DateInput, Field, Modal, Select, TextInput } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { countryFlag, countryName, formatHours, hoursToInput, parseHours } from "../lib/format";

const WEEKDAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;

type Board = NonNullable<FunctionReturnType<typeof api.board.get>>;
type BoardItem = Board["items"][number];

function showsInWeek(item: BoardItem, days: { date: string }[]) {
  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  if (!first || !last) return false;
  if (item.tipo === "despliegue") {
    return !item.deployDate || (item.deployDate >= first && item.deployDate <= last);
  }
  if (!item.endedOn) return true;
  return first <= item.endedOn;
}

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
  const reorder = useMutation(api.items.reorder);
  const [filter, setFilter] = useState<"todos" | Tipo>("todos");
  const [entryKind, setEntryKind] = useState<"regular" | "extra">("regular");
  const [dialog, setDialog] = useState<
    { mode: "create"; tipo: Tipo } | { mode: "edit"; item: BoardItem } | null
  >(null);
  const [dragState, setDragState] = useState<{ itemId: Id<"items">; weekN: number } | null>(null);
  const [orderOverride, setOrderOverride] = useState<Id<"items">[] | null>(null);
  const orderRef = useRef<Id<"items">[] | null>(null);

  useEffect(() => {
    if (!dragState) setOrderOverride(null);
  }, [board?.items]);

  useEffect(() => {
    if (!dragState || !board) return;
    const { itemId, weekN } = dragState;
    const initialServerOrder = board.items.map((item) => item._id);

    const onPointerMove = (event: PointerEvent) => {
      const cells = [
        ...document.querySelectorAll<HTMLElement>(`[data-week-card="${weekN}"] [data-item-id]`),
      ];
      if (cells.length < 2) return;
      const weekIds = cells
        .map((cell) => cell.dataset.itemId as Id<"items"> | undefined)
        .filter((id): id is Id<"items"> => Boolean(id));
      const fromIndex = weekIds.indexOf(itemId);
      if (fromIndex < 0) return;

      let toIndex = fromIndex;
      for (let i = 0; i < cells.length; i += 1) {
        const rect = cells[i]!.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (i < fromIndex && event.clientY < midY) {
          toIndex = i;
          break;
        }
        if (i > fromIndex && event.clientY > midY) {
          toIndex = i;
        }
      }
      if (toIndex === fromIndex) return;

      const nextWeekIds = weekIds.slice();
      const [moved] = nextWeekIds.splice(fromIndex, 1);
      if (!moved) return;
      nextWeekIds.splice(toIndex, 0, moved);

      const currentFull = orderRef.current ?? initialServerOrder;
      const weekSet = new Set(weekIds);
      let cursor = 0;
      const nextFull = currentFull.map((id) => {
        if (!weekSet.has(id)) return id;
        const replacement = nextWeekIds[cursor];
        cursor += 1;
        return replacement ?? id;
      });
      orderRef.current = nextFull;
      setOrderOverride(nextFull);
    };

    const finishDrag = () => {
      const finalOrder = orderRef.current;
      setDragState(null);
      if (!finalOrder) return;
      const changed = finalOrder.some((id, idx) => id !== initialServerOrder[idx]);
      if (!changed) {
        setOrderOverride(null);
        return;
      }
      void reorder({ userId, year, month, itemIds: finalOrder }).catch((caught) => {
        setOrderOverride(null);
        onError(errorMessage(caught));
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [board, dragState, month, onError, reorder, userId, year]);

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

  const orderedItems = orderOverride
    ? orderOverride
        .map((id) => board.items.find((item) => item._id === id))
        .filter((item): item is BoardItem => Boolean(item))
        .concat(board.items.filter((item) => !orderOverride.includes(item._id)))
    : board.items;
  const visible = orderedItems.filter((item) => filter === "todos" || item.tipo === filter);
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
              "Quedaron cargados los incidentes y las reuniones.",
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
            Empezá con incidentes y reuniones, copiá los ítems del mes anterior o cargá un PR, un PPM o un
            despliegue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {board.weeks.map((week, weekIndex) => {
            const days = board.days.filter((day) => day.week === week.n);
            const weekItems = visible.filter((item) => showsInWeek(item, days));
            const weekHours = weekItems.reduce((sum, item) => sum + (item.weeks[weekIndex] ?? 0), 0);
            const weekExtra = weekItems.reduce((sum, item) => sum + (item.extraWeeks[weekIndex] ?? 0), 0);
            const notes = days.flatMap((day) => {
              const bits = [
                day.holidayName ? `${day.day} · ${day.holidayName}` : null,
                day.infoHoliday ? `${day.day} · Colombia: ${day.infoHoliday}` : null,
                day.absence ? `${day.day} · Ausencia: ${day.absence.reason}` : null,
              ];
              return bits.filter((bit): bit is string => Boolean(bit));
            });
            return (
              <article key={week.n} data-week-card={week.n} className="week-card">
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

                    {weekItems.map((item, rowIndex) => (
                      <WeekRow
                        key={item._id}
                        item={item}
                        days={days}
                        weekIndex={weekIndex}
                        rowIndex={rowIndex}
                        rowCount={weekItems.length}
                        isDragging={dragState?.itemId === item._id}
                        onDragStart={(event) => {
                          if (event.button !== 0 && event.pointerType === "mouse") return;
                          event.preventDefault();
                          event.stopPropagation();
                          const initialOrder = orderedItems.map((row) => row._id);
                          orderRef.current = initialOrder;
                          setOrderOverride(initialOrder);
                          setDragState({ itemId: item._id, weekN: week.n });
                        }}
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
                      const total = weekItems.reduce((sum, item) => sum + (item.hours[day.day - 1] ?? 0), 0);
                      const extra = weekItems.reduce((sum, item) => sum + (item.extras[day.day - 1] ?? 0), 0);
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
          items={board.items}
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

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
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
  isDragging,
  kind,
  onDragStart,
  onEdit,
  onCommit,
  onInvalid,
}: {
  item: BoardItem;
  days: BoardDay[];
  weekIndex: number;
  rowIndex: number;
  rowCount: number;
  isDragging: boolean;
  kind: "regular" | "extra";
  onDragStart: (event: React.PointerEvent) => void;
  onEdit: () => void;
  onCommit: (date: string, hours: number) => Promise<unknown>;
  onInvalid: () => void;
}) {
  const meta = TIPO_META[item.tipo];
  const values = kind === "extra" ? item.extras : item.hours;
  const weekTotal = kind === "extra" ? (item.extraWeeks[weekIndex] ?? 0) : (item.weeks[weekIndex] ?? 0);
  return (
    <>
      <div
        data-item-id={item._id}
        className={`flex min-w-0 items-center gap-2 border-r border-b border-sheet-line px-2.5 py-2 ${isDragging ? "bg-peach/45" : "bg-sheet"}`}
      >
        <button
          type="button"
          aria-label={`Mover ${item.name}`}
          title="Mantené apretado y arrastrá para cambiar el orden"
          onPointerDown={onDragStart}
          className="grid h-8 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-soft select-none hover:bg-paper hover:text-ink active:cursor-grabbing"
        >
          <GripIcon />
        </button>
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: meta.dot }} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit} title={item.notes ?? "Editar ítem"}>
          <span className="block truncate text-sm font-semibold">{item.name}</span>
          <span className="block truncate text-xs text-ink-soft">{itemCaption(item)}</span>
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
              locked={Boolean(item.endedOn && day.date > item.endedOn) || (item.tipo === "despliegue" && day.date !== item.deployDate)}
              lockTitle={
                item.tipo === "despliegue" && day.date !== item.deployDate
                  ? "El despliegue dura un solo día"
                  : item.endedOn && day.date > item.endedOn
                    ? "Terminado: no se cargan horas después de esa fecha"
                    : undefined
              }
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
  locked,
  lockTitle,
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
  locked: boolean;
  lockTitle?: string;
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
      disabled={locked}
      title={locked ? lockTitle : undefined}
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
      className={`hour-input ${value > 0 ? "font-semibold" : ""} ${extra ? "is-extra" : ""} ${marked ? "is-deploy" : ""} ${locked ? "cursor-not-allowed opacity-45" : ""}`}
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

function itemCaption(item: BoardItem) {
  const parts = [TIPO_META[item.tipo].asignacion];
  if (item.ticket) parts.push(item.ticket);
  if (item.tipo === "despliegue" && item.deployDate) parts.push(longDate(item.deployDate));
  if (item.environment) parts.push(item.environment);
  if (item.outcome) parts.push(OUTCOME_LABEL[item.outcome]);
  if (item.relatedTicket) {
    parts.push(item.relatedName ? `${item.relatedTicket} (${item.relatedName})` : item.relatedTicket);
  }
  if (item.endedOn) parts.push(`terminado el ${longDate(item.endedOn)}`);
  return parts.join(" · ");
}

function knownEnvironment(value: string | null | undefined) {
  if (value === "QAM" || value === "Producción") return value;
  const clean = (value ?? "").toLowerCase();
  if (clean.includes("qam") || clean === "qa") return "QAM";
  if (clean.includes("prod")) return "Producción";
  return "";
}

type ItemDraft = {
  tipo: Tipo;
  name: string;
  ticket: string;
  deployDate: string;
  environment: string;
  notes: string;
  endedOn: string;
  relatedKind: RelatedKind | "";
  relatedTicket: string;
  outcome: Outcome | "";
};

function draftKey(draft: ItemDraft) {
  return JSON.stringify(draft);
}

function ItemDialog({
  year,
  month,
  userId,
  items,
  dialog,
  onClose,
  onError,
}: {
  year: number;
  month: number;
  userId: Id<"users">;
  items: BoardItem[];
  dialog: { mode: "create"; tipo: Tipo } | { mode: "edit"; item: BoardItem };
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const create = useMutation(api.items.create);
  const update = useMutation(api.items.update);
  const remove = useMutation(api.items.remove);
  const initial = dialog.mode === "edit" ? dialog.item : null;
  const opened = useRef<ItemDraft>({
    tipo: dialog.mode === "create" ? dialog.tipo : dialog.item.tipo,
    name: initial?.name ?? "",
    ticket: initial?.ticket ?? "",
    deployDate: initial?.deployDate ?? "",
    environment: knownEnvironment(initial?.environment),
    notes: initial?.notes ?? "",
    endedOn: initial?.endedOn ?? "",
    relatedKind: initial?.relatedKind ?? "",
    relatedTicket: initial?.relatedTicket ?? "",
    outcome: initial?.outcome ?? "",
  });
  const [tipo, setTipo] = useState<Tipo>(opened.current.tipo);
  const [name, setName] = useState(opened.current.name);
  const [ticket, setTicket] = useState(opened.current.ticket);
  const [deployDate, setDeployDate] = useState(opened.current.deployDate);
  const [environment, setEnvironment] = useState(opened.current.environment);
  const [notes, setNotes] = useState(opened.current.notes);
  const [endedOn, setEndedOn] = useState(opened.current.endedOn);
  const [relatedKind, setRelatedKind] = useState<RelatedKind | "">(opened.current.relatedKind);
  const [relatedTicket, setRelatedTicket] = useState(opened.current.relatedTicket);
  const [outcome, setOutcome] = useState<Outcome | "">(opened.current.outcome);
  const [askDelete, setAskDelete] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [pending, setPending] = useState(false);
  const meta = TIPO_META[tipo];
  const dirty =
    draftKey({
      tipo,
      name,
      ticket,
      deployDate,
      environment,
      notes,
      endedOn,
      relatedKind,
      relatedTicket,
      outcome,
    }) !== draftKey(opened.current);

  function requestClose() {
    if (askLeave || askDelete) return;
    if (dirty) setAskLeave(true);
    else onClose();
  }

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
      endedOn,
      relatedKind,
      relatedTicket,
      outcome,
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
      onClose={requestClose}
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
              ? "Si lo dejás vacío, queda como Incidente/Service Request."
              : tipo === "gestion"
                ? "Si lo dejás vacío, queda como Reuniones."
                : tipo === "documentacion"
                  ? "Si lo dejás vacío, queda como Documentación."
                  : tipo === "despliegue"
                    ? "Si lo dejás vacío, queda el número de cambio."
                    : undefined
          }
        >
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={placeholderFor(tipo)}
          />
        </Field>
        {tipo !== "gestion" && tipo !== "documentacion" && tipo !== "cierre" && (
          <Field
            label={
              tipo === "problema"
                ? "Número de PR"
                : tipo === "requerimiento"
                  ? "Número de PPM"
                  : tipo === "despliegue"
                    ? "Número de cambio"
                    : "Ticket"
            }
            hint={
              tipo === "bandeja"
                ? "Opcional. INC para un incidente o SR para un service request."
                : tipo === "despliegue"
                  ? "El cambio que sale, por ejemplo CH-0000."
                  : undefined
            }
          >
            <TextInput
              value={ticket}
              onChange={(event) => setTicket(event.target.value)}
              required={tipo === "problema" || tipo === "requerimiento" || tipo === "despliegue"}
              placeholder={
                tipo === "problema"
                  ? "PR-961"
                  : tipo === "requerimiento"
                    ? "PPM-5528"
                    : tipo === "despliegue"
                      ? "CH-0000"
                      : "INC-1024"
              }
            />
          </Field>
        )}
        {tipo === "despliegue" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Día del despliegue"
                hint="Dura un solo día. Las horas se cargan ahí y no pasa al mes siguiente."
              >
                <DateInput
                  required
                  min={monthBounds(year, month).start}
                  max={monthBounds(year, month).end}
                  value={deployDate}
                  onChange={setDeployDate}
                />
              </Field>
              <Field label="Ambiente">
                <Select
                  value={environment}
                  onChange={setEnvironment}
                  options={[
                    { value: "", label: "Elegí QAM o Producción" },
                    ...DEPLOY_ENVIRONMENTS.map((value) => ({ value, label: value })),
                  ]}
                />
              </Field>
            </div>
            <Field label="Sale de">
              <Select
                value={relatedKind}
                onChange={(value) => setRelatedKind(value as RelatedKind | "")}
                options={[
                  { value: "", label: "Requerimiento, problema, incidente o service request" },
                  ...RELATED_KINDS.map((value) => ({ value, label: RELATED_LABEL[value] })),
                ]}
              />
            </Field>
            <Field
              label={
                relatedKind === "problema"
                  ? "Ticket de problema"
                  : relatedKind === "incidente"
                    ? "Ticket de incidente"
                    : relatedKind === "service"
                      ? "Ticket de service request (SR / SD)"
                      : "Ticket de requerimiento"
              }
              hint="El despliegue queda relacionado con ese PR, PPM, INC o SR/SD."
            >
              <TextInput
                value={relatedTicket}
                onChange={(event) => {
                  const next = event.target.value;
                  setRelatedTicket(next);
                  const upper = next.trim().toUpperCase();
                  if (upper.startsWith("PR")) setRelatedKind("problema");
                  else if (upper.startsWith("PPM")) setRelatedKind("requerimiento");
                  else if (upper.startsWith("INC")) setRelatedKind("incidente");
                  else if (upper.startsWith("SR") || upper.startsWith("SD")) setRelatedKind("service");
                }}
                required
                placeholder={
                  relatedKind === "problema"
                    ? "PR-961"
                    : relatedKind === "incidente"
                      ? "INC-1024"
                      : relatedKind === "service"
                        ? "SR-204"
                        : "PPM-5528"
                }
              />
              {items.some((candidate) => candidate.tipo !== "despliegue" && Boolean(candidate.ticket)) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {items
                    .filter(
                      (candidate): candidate is BoardItem & { ticket: string } =>
                        candidate.tipo !== "despliegue" && Boolean(candidate.ticket),
                    )
                    .map((candidate) => {
                      const active = relatedTicket.trim().toUpperCase() === candidate.ticket.toUpperCase();
                      return (
                        <button
                          key={candidate._id}
                          type="button"
                          onClick={() => {
                            setRelatedTicket(candidate.ticket);
                            const upper = candidate.ticket.toUpperCase();
                            if (candidate.tipo === "problema" || upper.startsWith("PR")) {
                              setRelatedKind("problema");
                            } else if (candidate.tipo === "requerimiento" || upper.startsWith("PPM")) {
                              setRelatedKind("requerimiento");
                            } else if (upper.startsWith("SR") || upper.startsWith("SD")) {
                              setRelatedKind("service");
                            } else {
                              setRelatedKind("incidente");
                            }
                          }}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                            active
                              ? "border-copper bg-peach text-ink"
                              : "border-line bg-paper text-ink-soft hover:text-ink"
                          }`}
                        >
                          {candidate.ticket} · {candidate.name}
                        </button>
                      );
                    })}
                </div>
              )}
            </Field>
            <Field label="Resultado" hint="Si todavía no pasó, podés dejarlo sin resultado.">
              <Select
                value={outcome}
                onChange={(value) => setOutcome(value as Outcome | "")}
                options={[
                  { value: "", label: "Sin resultado (todavía no pasó)" },
                  ...OUTCOMES.map((value) => ({ value, label: OUTCOME_LABEL[value] })),
                ]}
              />
            </Field>
          </>
        )}
        {canClose(tipo) && (
          <Field
            label="Terminado"
            hint="Cuando lo cierres, poné el día. Desde la semana siguiente deja de aparecer, tampoco vuelve en los meses de después, y no se le cargan más horas."
          >
            <DateInput value={endedOn} onChange={setEndedOn} />
          </Field>
        )}
        <Field label="Nota">
          <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {initial && (
            <Button type="button" variant="danger" onClick={() => setAskDelete(true)}>
              Eliminar
            </Button>
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
        {askLeave && (
          <ConfirmDialog
            title="Salir"
            body="¿Seguro que querés salir? Los cambios de este ítem no se guardaron."
            confirmLabel="Salir"
            danger={false}
            onClose={() => setAskLeave(false)}
            onConfirm={onClose}
          />
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
  if (tipo === "documentacion") return "Documentación del cierre";
  if (tipo === "gestion") return "Reuniones";
  return "";
}
