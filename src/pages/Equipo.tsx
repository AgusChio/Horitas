import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { resolveSchedule, scheduleSummary } from "../../convex/dates";
import { Button, Field, Select, TextInput } from "../components/ui";
import { errorMessage } from "../lib/errors";
import { countryFlag } from "../lib/format";

const DAY_CHOICES = [
  { day: 1, label: "Lun" },
  { day: 2, label: "Mar" },
  { day: 3, label: "Mié" },
  { day: 4, label: "Jue" },
  { day: 5, label: "Vie" },
  { day: 6, label: "Sáb" },
  { day: 0, label: "Dom" },
] as const;

type Person = {
  _id: Id<"users">;
  name: string;
  email: string;
  country: "AR" | "CO" | null;
  role: "admin" | "member";
  active: boolean;
  hoursPerDay: number | null;
  workdays: number[] | null;
  workStart: string | null;
  workEnd: string | null;
};

export function Equipo({
  people,
  meId,
  isAdmin,
  settings,
  onToast,
  onError,
}: {
  people: Person[];
  meId: Id<"users">;
  isAdmin: boolean;
  settings: { hoursPerDay: number; allowedDomains: string[]; allowAnyDomain: boolean } | null;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const updateMember = useMutation(api.team.updateMember);
  const updateSettings = useMutation(api.team.updateSettings);
  const [hoursPerDay, setHoursPerDay] = useState(String(settings?.hoursPerDay ?? 8));
  const [domains, setDomains] = useState(settings?.allowedDomains ?? []);
  const [draft, setDraft] = useState("");
  const [allowAny, setAllowAny] = useState(settings?.allowAnyDomain ?? false);

  function addDomain() {
    const next = draft.trim().toLowerCase().replace(/^@/, "");
    if (!next) return;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(next)) {
      onError("Ese dominio no es válido. Usá algo como empresa.com, sin el @.");
      return;
    }
    setDomains((current) => (current.includes(next) ? current : [...current, next]));
    setDraft("");
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-4xl leading-none">Equipo</h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Cada persona entra con su mail y una contraseña. El país define qué feriados le restan
            capacidad.
          </p>
        </div>
        <ScheduleCard
          people={people}
          meId={meId}
          isAdmin={isAdmin}
          fallbackHours={settings?.hoursPerDay ?? 8}
          onToast={onToast}
          onError={onError}
        />
        {people.map((person) => (
          <PersonRow
            key={person._id}
            person={person}
            isAdmin={isAdmin}
            isSelf={person._id === meId}
            onSave={async (value) => {
              try {
                await updateMember(value);
                onToast("Cambios guardados.");
              } catch (error) {
                onError(errorMessage(error));
              }
            }}
          />
        ))}
      </div>

      <form
        className="h-fit space-y-3 rounded-3xl border border-line bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isAdmin) return;
          const pending = draft.trim().toLowerCase().replace(/^@/, "");
          const allowedDomains = pending && !domains.includes(pending) ? [...domains, pending] : domains;
          if (pending && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(pending)) {
            onError("Ese dominio no es válido. Usá algo como empresa.com, sin el @.");
            return;
          }
          void updateSettings({
            hoursPerDay: Number(hoursPerDay),
            allowedDomains,
            allowAnyDomain: allowAny,
          })
            .then(() => onToast("La configuración quedó guardada."))
            .catch((error) => onError(errorMessage(error)));
        }}
      >
        <h3 className="font-display text-3xl">Acceso</h3>
        <Field label="Jornada del equipo" hint="La usa quien todavía no definió sus días. Con 8 horas, 21 días dan 168.">
          <TextInput
            type="number"
            min={1}
            max={12}
            step={0.5}
            value={hoursPerDay}
            disabled={!isAdmin}
            onChange={(event) => setHoursPerDay(event.target.value)}
          />
        </Field>
        <Field
          label="Dominios corporativos"
          hint="Podés agregar varios. Quien se registre con uno de estos mails entra al equipo. Quien ya tiene cuenta sigue entrando."
        >
          <div className="flex gap-2">
            <TextInput
              value={draft}
              disabled={!isAdmin}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addDomain();
              }}
              placeholder="empresa.com"
              aria-label="Nuevo dominio"
            />
            <Button type="button" variant="ghost" disabled={!isAdmin || draft.trim() === ""} onClick={addDomain}>
              Agregar
            </Button>
          </div>
        </Field>
        {domains.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {domains.map((domain) => (
              <li key={domain} className="flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-sm">
                <span>{domain}</span>
                {isAdmin && (
                  <button
                    type="button"
                    className="text-base leading-none text-ink-soft"
                    aria-label={`Quitar ${domain}`}
                    onClick={() => setDomains((current) => current.filter((item) => item !== domain))}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-copper"
            checked={allowAny}
            disabled={!isAdmin}
            onChange={(event) => setAllowAny(event.target.checked)}
          />
          <span>Permitir cualquier mail, no solo el corporativo.</span>
        </label>
        {!allowAny && (settings?.allowedDomains.length ?? 0) === 0 && (
          <p className="rounded-2xl bg-peach/50 px-3 py-2 text-sm leading-6">
            Todavía no hay un dominio habilitado. Hasta que lo cargues, nadie más puede crear una cuenta.
          </p>
        )}
        {isAdmin ? (
          <Button type="submit">Guardar acceso</Button>
        ) : (
          <p className="text-sm text-ink-soft">Solo quien administra puede cambiar el acceso.</p>
        )}
      </form>
    </section>
  );
}

function ScheduleCard({
  people,
  meId,
  isAdmin,
  fallbackHours,
  onToast,
  onError,
}: {
  people: Person[];
  meId: Id<"users">;
  isAdmin: boolean;
  fallbackHours: number;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [userId, setUserId] = useState(meId);
  const person = people.find((item) => item._id === userId) ?? people.find((item) => item._id === meId);
  if (!person) return null;
  const schedule = resolveSchedule(person, fallbackHours);
  return (
    <ScheduleForm
      key={`${person._id}-${schedule.hoursPerDay}-${schedule.workdays.join(",")}`}
      person={person}
      schedule={schedule}
      people={people}
      isAdmin={isAdmin}
      onPick={setUserId}
      onToast={onToast}
      onError={onError}
    />
  );
}

function ScheduleForm({
  person,
  schedule,
  people,
  isAdmin,
  onPick,
  onToast,
  onError,
}: {
  person: Person;
  schedule: ReturnType<typeof resolveSchedule>;
  people: Person[];
  isAdmin: boolean;
  onPick: (userId: Id<"users">) => void;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const updateSchedule = useMutation(api.team.updateSchedule);
  const [hours, setHours] = useState(String(schedule.hoursPerDay));
  const [days, setDays] = useState<number[]>(schedule.workdays);

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]));
  }

  return (
    <form
      className="space-y-3 rounded-3xl border border-line bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void updateSchedule({
          userId: person._id,
          hoursPerDay: Number(hours),
          workdays: days,
        })
          .then(() => onToast("La jornada quedó guardada."))
          .catch((caught) => onError(errorMessage(caught)));
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-3xl">Jornada</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {scheduleSummary(days, Number(hours) || schedule.hoursPerDay)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Solo cuentan los días y las horas. La entrada y la salida pueden cambiar.
          </p>
        </div>
        {isAdmin && people.length > 1 && (
          <Select
            className="w-full sm:w-56"
            label="Persona"
            value={person._id}
            onChange={(value) => onPick(value as Id<"users">)}
            options={people.map((item) => ({ value: item._id, label: item.name }))}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {DAY_CHOICES.map((choice) => {
          const active = days.includes(choice.day);
          return (
            <button
              key={choice.day}
              type="button"
              aria-pressed={active}
              onClick={() => toggleDay(choice.day)}
              className={`h-9 min-w-12 rounded-full px-3 text-sm font-semibold ${active ? "bg-inverse text-on-inverse" : "border border-line text-ink-soft"}`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      <Field label="Horas de jornada" hint="Lo que cuenta un día de trabajo, sin la hora de entrada ni de salida.">
        <TextInput
          type="number"
          min={1}
          max={12}
          step={0.5}
          required
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
      </Field>
      <Button type="submit">Guardar jornada</Button>
    </form>
  );
}

function PersonRow({
  person,
  isAdmin,
  isSelf,
  onSave,
}: {
  person: Person;
  isAdmin: boolean;
  isSelf: boolean;
  onSave: (value: {
    userId: Id<"users">;
    name: string;
    country: "AR" | "CO";
    role: "admin" | "member";
    active: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(person.name);
  const [country, setCountry] = useState<"AR" | "CO">(person.country ?? "AR");
  const [role, setRole] = useState(person.role);
  const [active, setActive] = useState(person.active);
  const canEdit = isAdmin || isSelf;

  return (
    <form
      className="grid gap-3 rounded-3xl border border-line bg-card p-4 md:grid-cols-[1.3fr_0.8fr_0.7fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ userId: person._id, name, country, role, active });
      }}
    >
      <Field label={person.email || "Mail"}>
        <TextInput value={name} disabled={!canEdit} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="País">
        <Select
          value={country}
          disabled={!canEdit}
          onChange={(value) => setCountry(value as "AR" | "CO")}
          options={[
            { value: "AR", label: `${countryFlag("AR")} Argentina` },
            { value: "CO", label: `${countryFlag("CO")} Colombia` },
          ]}
        />
      </Field>
      <Field label="Rol">
        <Select
          value={role}
          disabled={!isAdmin}
          onChange={(value) => setRole(value as "admin" | "member")}
          options={[
            { value: "member", label: "Integrante" },
            { value: "admin", label: "Administra" },
          ]}
        />
      </Field>
      <div className="flex items-end gap-3">
        {isAdmin && (
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="accent-copper"
            />
            Activa
          </label>
        )}
        {canEdit && (
          <Button type="submit" className="mb-0.5">
            Guardar
          </Button>
        )}
      </div>
    </form>
  );
}
