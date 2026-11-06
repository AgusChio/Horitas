import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MONTHS, longDate } from "../../convex/dates";
import { Button, ConfirmDialog, Field, Modal, Select, TextInput } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { countryName } from "../lib/format";

type HolidayEdit = {
  _id: Id<"holidays">;
  date: string;
  country: "AR" | "CO";
  name: string;
};

export function Calendario({
  year,
  onToast,
  onError,
}: {
  year: number;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const holidays = useQuery(api.calendar.list, { year });
  const add = useMutation(api.calendar.add);
  const update = useMutation(api.calendar.update);
  const remove = useMutation(api.calendar.remove);
  const restore = useMutation(api.calendar.restoreOfficial);
  const [country, setCountry] = useState<"AR" | "CO">("AR");
  const [date, setDate] = useState(`${year}-01-01`);
  const [name, setName] = useState("");
  const [holidayCountry, setHolidayCountry] = useState<"AR" | "CO">("AR");
  const [editing, setEditing] = useState<HolidayEdit | null>(null);
  const [removing, setRemoving] = useState<HolidayEdit | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  if (holidays === undefined) return <p className="text-sm text-ink-soft">Cargando el calendario…</p>;

  const groups = MONTHS.map((month, index) => ({
    month,
    items: holidays.filter((holiday) => {
      const sameMonth = Number(holiday.date.slice(5, 7)) === index + 1;
      if (!sameMonth) return false;
      if (country === "CO") return holiday.country === "CO";
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await add({ date, country: holidayCountry, name });
      setName("");
      onToast("Feriado agregado.");
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-4xl leading-none">Feriados {year}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
              El calendario que cuenta es el argentino. Los feriados de Colombia se ven en la misma
              lista para tenerlos presentes: no restan horas de quien está en Argentina. Para quien
              está en Colombia, esos días sí descuentan su jornada.
            </p>
          </div>
          <Select
            className="w-full sm:w-48"
            label="País de los feriados"
            value={country}
            onChange={(value) => setCountry(value as "AR" | "CO")}
            options={[
              { value: "AR", label: "Argentina" },
              { value: "CO", label: "Solo Colombia" },
            ]}
          />
        </div>
        <div className="space-y-4">
          {groups.length === 0 && (
            <p className="rounded-3xl border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-ink-soft">
              No hay feriados para este filtro.
            </p>
          )}
          {groups.map((group) => (
            <article key={group.month} className="rounded-3xl border border-line bg-card p-4">
              <h3 className="font-display text-2xl capitalize">{group.month}</h3>
              <ul className="mt-2 divide-y divide-line">
                {group.items.map((holiday) => (
                  <li key={holiday._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      <strong>{longDate(holiday.date)}</strong> · {countryName(holiday.country)} · {holiday.name}
                      <span className="ml-2 text-xs text-ink-soft">
                        {holiday.country === "CO" ? "informativo, no resta en Argentina" : holiday.source === "oficial" ? "oficial" : "cargado"}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-3">
                      <button type="button" className="text-xs font-semibold" onClick={() => setEditing(holiday)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-800"
                        onClick={() => setRemoving(holiday)}
                      >
                        Quitar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-3 rounded-3xl border border-line bg-card p-4">
          <h3 className="font-display text-3xl">Agregar</h3>
          <Field label="Fecha">
            <TextInput type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="País">
            <Select
              value={holidayCountry}
              onChange={(value) => setHolidayCountry(value as "AR" | "CO")}
              options={[
                { value: "AR", label: "Argentina" },
                { value: "CO", label: "Colombia" },
              ]}
            />
          </Field>
          <Field label="Nombre">
            <TextInput required value={name} onChange={(event) => setName(event.target.value)} placeholder="Feriado puente" />
          </Field>
          <Button type="submit">Agregar feriado</Button>
        </form>
        <div className="rounded-3xl border border-line bg-card p-4">
          <h3 className="font-display text-2xl">Oficiales</h3>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Vuelve a cargar los feriados oficiales que se hayan borrado. No pisa un día que ya tenga otro nombre.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-3"
            onClick={() =>
              void restore()
                .then((added) =>
                  onToast(added ? `Se agregaron ${added} feriados.` : "El calendario oficial ya estaba completo."),
                )
                .catch((caught) => onError(errorMessage(caught)))
            }
          >
            Completar feriados oficiales
          </Button>
        </div>
      </aside>
      {editing && (
        <HolidayDialog
          holiday={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onToast("Feriado actualizado.");
          }}
          onError={onError}
          onSave={(value) => update({ holidayId: editing._id, ...value })}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Quitar feriado"
          body={`Se quita ${removing.name} del ${longDate(removing.date)}. La capacidad de ese día vuelve a contar.`}
          confirmLabel="Quitar"
          pending={pendingDelete}
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            setPendingDelete(true);
            void remove({ holidayId: removing._id })
              .then(() => {
                setRemoving(null);
                onToast("Feriado quitado.");
              })
              .catch((caught) => onError(errorMessage(caught)))
              .finally(() => setPendingDelete(false));
          }}
        />
      )}
    </section>
  );
}

function HolidayDialog({
  holiday,
  onClose,
  onSaved,
  onError,
  onSave,
}: {
  holiday: HolidayEdit;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onSave: (value: { date: string; country: "AR" | "CO"; name: string }) => Promise<unknown>;
}) {
  const [date, setDate] = useState(holiday.date);
  const [holidayCountry, setHolidayCountry] = useState<"AR" | "CO">(holiday.country);
  const [name, setName] = useState(holiday.name);
  const [pending, setPending] = useState(false);

  return (
    <Modal title="Editar feriado" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          void onSave({ date, country: holidayCountry, name })
            .then(onSaved)
            .catch((caught) => {
              setPending(false);
              onError(errorMessage(caught));
            });
        }}
      >
        <Field label="Fecha">
          <TextInput type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="País">
          <Select
            value={holidayCountry}
            onChange={(value) => setHolidayCountry(value as "AR" | "CO")}
            options={[
              { value: "AR", label: "Argentina" },
              { value: "CO", label: "Colombia" },
            ]}
          />
        </Field>
        <Field label="Nombre">
          <TextInput required value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </Modal>
  );
}
