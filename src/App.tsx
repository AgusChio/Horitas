import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { monthTitle, shiftMonth } from "../convex/dates";
import { ErrorDialog, Select } from "./components/ui";
import { Ingreso } from "./pages/Ingreso";
import { Planilla } from "./pages/Planilla";
import { Capacidad } from "./pages/Capacidad";
import { Graficos } from "./pages/Graficos";
import { Calendario } from "./pages/Calendario";
import { Equipo } from "./pages/Equipo";
import { Informe } from "./pages/Informe";
import { readShare } from "./lib/share";

const shareLink = readShare();

type View = "planilla" | "capacidad" | "graficos" | "calendario" | "equipo";

const VIEWS: { id: View; label: string }[] = [
  { id: "planilla", label: "Planilla" },
  { id: "capacidad", label: "Capacidad" },
  { id: "graficos", label: "Gráficos" },
  { id: "calendario", label: "Feriados" },
  { id: "equipo", label: "Equipo" },
];

type Period = { year: number; month: number };

export default function App() {
  if (shareLink) {
    return <Informe token={shareLink.token} year={shareLink.year} month={shareLink.month} />;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <Splash />;
  if (!isAuthenticated) return <Ingreso />;
  return <Home />;
}

function Home() {
  const me = useQuery(api.team.me);
  const team = useQuery(api.team.list);
  const ensureDefaults = useMutation(api.team.ensureDefaults);
  const setTheme = useMutation(api.team.setTheme);
  const { signOut } = useAuthActions();
  const ready = useRef(false);
  const [view, setView] = useState<View>("planilla");
  const [period, setPeriod] = useState(loadPeriod);
  const [picked, setPicked] = useState<string | null>(() => localStorage.getItem("horas.user"));
  const [toast, setToast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    void ensureDefaults();
  }, [ensureDefaults]);

  useEffect(() => {
    localStorage.setItem("horas.period", JSON.stringify(period));
  }, [period]);

  useEffect(() => {
    if (!me) return;
    const theme = me.theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("horas.theme", theme);
  }, [me?._id, me?.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (me === undefined || team === undefined) return <Splash />;
  if (!me || me.active === false) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-4xl">Esta cuenta está inactiva</h1>
        <button type="button" className="mt-6 font-semibold text-copper-dark" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </main>
    );
  }
  if (!team) return <Splash />;

  const selected =
    team.people.find((person) => person._id === picked && person.active) ??
    team.people.find((person) => person._id === me._id && person.active) ??
    team.people.find((person) => person.active);
  const userId = selected?._id;
  const isAdmin = me.role === "admin";
  const needsDomain = isAdmin && team.settings && !team.settings.allowAnyDomain && team.settings.allowedDomains.length === 0;

  const people = team.people.filter((person) => person.active);

  return (
    <div className="min-h-screen">
      <header className="app-bar sticky top-0 z-30 border-b border-line bg-card px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3">
          <div className="mr-auto min-w-0">
            <p className="font-display text-3xl leading-none">Horitas</p>
            <p className="truncate text-xs text-ink-soft">{me.name ?? me.email}</p>
          </div>
          <MonthSwitcher period={period} onChange={setPeriod} className="hidden md:flex" />
          {view === "planilla" && userId && (
            <PersonSelect
              people={people}
              value={userId}
              onChange={(next) => {
                setPicked(next);
                localStorage.setItem("horas.user", next);
              }}
              className="hidden md:block"
            />
          )}
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-ink"
            aria-label={me.theme === "dark" ? "Usar modo claro" : "Usar modo oscuro"}
            onClick={() => {
              const next = me.theme === "dark" ? "light" : "dark";
              document.documentElement.classList.toggle("dark", next === "dark");
              localStorage.setItem("horas.theme", next);
              void setTheme({ theme: next });
            }}
          >
            {me.theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="text-sm font-semibold text-ink-soft" onClick={() => void signOut()}>
            Salir
          </button>
        </div>
        <div className="mx-auto mt-3 max-w-[1400px] space-y-2 md:hidden">
          <MonthSwitcher period={period} onChange={setPeriod} className="justify-center" />
          {view === "planilla" && userId && (
            <PersonSelect
              people={people}
              value={userId}
              onChange={(next) => {
                setPicked(next);
                localStorage.setItem("horas.user", next);
              }}
              className="w-full"
            />
          )}
        </div>
        <nav className="mx-auto mt-3 hidden max-w-[1400px] gap-1 md:flex" aria-label="Secciones">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${view === item.id ? "bg-inverse text-on-inverse" : "text-ink-soft"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 pb-28 md:px-6 md:pb-8">
        {needsDomain && view !== "equipo" && (
          <button
            type="button"
            onClick={() => setView("equipo")}
            className="mb-4 block w-full rounded-2xl bg-peach/70 px-4 py-3 text-left text-sm"
          >
            Falta habilitar el dominio del mail corporativo. Hasta entonces nadie más puede crear una cuenta.
          </button>
        )}
        {view === "planilla" && userId && (
          <Planilla
            year={period.year}
            month={period.month}
            userId={userId as Id<"users">}
            onToast={setToast}
            onError={setProblem}
          />
        )}
        {view === "capacidad" && (
          <Capacidad year={period.year} month={period.month} onToast={setToast} onError={setProblem} />
        )}
        {view === "graficos" && (
          <Graficos year={period.year} month={period.month} isAdmin={isAdmin} onToast={setToast} onError={setProblem} />
        )}
        {view === "calendario" && (
          <Calendario year={period.year} month={period.month} onToast={setToast} onError={setProblem} />
        )}
        {view === "equipo" && (
          <Equipo
            key={
              team.settings
                ? `${team.settings.hoursPerDay}-${team.settings.allowAnyDomain}-${team.settings.allowedDomains.join(",")}`
                : "sin-configuracion"
            }
            people={team.people}
            meId={me._id}
            isAdmin={isAdmin}
            settings={team.settings}
            onToast={setToast}
            onError={setProblem}
          />
        )}
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card md:hidden"
        style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
        aria-label="Secciones"
      >
        <div className="grid grid-cols-5">
          {VIEWS.map((item) => {
            const current = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => setView(item.id)}
                className={`flex flex-col items-center gap-1 px-1 py-2 text-[10px] leading-none font-semibold ${current ? "text-copper-dark" : "text-ink-soft"}`}
              >
                <span className={`grid h-8 w-10 place-items-center rounded-full ${current ? "bg-peach" : ""}`}>
                  <NavIcon id={item.id} />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
      {problem && <ErrorDialog message={problem} onClose={() => setProblem(null)} />}
      {toast && (
        <div className="fixed right-4 bottom-24 z-50 max-w-sm rounded-2xl bg-inverse px-4 py-3 text-sm text-on-inverse shadow-xl md:bottom-4" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function MonthSwitcher({
  period,
  onChange,
  className,
}: {
  period: Period;
  onChange: (period: Period) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-lg leading-none"
        aria-label="Mes anterior"
        onClick={() => onChange(shiftMonth(period.year, period.month, -1))}
      >
        ‹
      </button>
      <p className="min-w-36 text-center text-sm font-semibold capitalize">{monthTitle(period.year, period.month)}</p>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-card text-lg leading-none"
        aria-label="Mes siguiente"
        onClick={() => onChange(shiftMonth(period.year, period.month, 1))}
      >
        ›
      </button>
    </div>
  );
}

function PersonSelect({
  people,
  value,
  onChange,
  className,
}: {
  people: { _id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const current = people.find((person) => person._id === value);
  return (
    <div className={className}>
      <Select
        pill
        label={current ? `Persona: ${current.name}` : "Persona"}
        value={value}
        onChange={onChange}
        options={people.map((person) => ({ value: person._id, label: person.name }))}
      />
    </div>
  );
}

function NavIcon({ id }: { id: View }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
  if (id === "planilla") {
    return (
      <svg {...common}>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M4 8.5h16M4 13h16M9 8.5v12" />
      </svg>
    );
  }
  if (id === "capacidad") {
    return (
      <svg {...common}>
        <path d="M5 16a7 7 0 1 1 14 0" />
        <path d="M12 16V9.5" />
        <path d="M8 19.5h8" />
      </svg>
    );
  }
  if (id === "graficos") {
    return (
      <svg {...common}>
        <path d="M4 19.5h16" />
        <path d="M7 19.5v-6M12 19.5V6.5M17 19.5v-9" />
      </svg>
    );
  }
  if (id === "calendario") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3.5v3M16 3.5v3M4 10h16" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="8.5" r="2.4" />
      <circle cx="16" cy="9.5" r="1.8" />
      <path d="M4.5 18.5c.5-2.4 2.3-3.6 4.5-3.6s4 1.2 4.5 3.6" />
      <path d="M14.2 15.2c1.2-.3 2.3-.1 3.3 1.1" />
    </svg>
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

function Splash() {
  return (
    <main className="grid min-h-screen place-items-center">
      <p className="font-display text-4xl">Horitas</p>
    </main>
  );
}

function loadPeriod() {
  const now = new Date();
  const fallback = { year: now.getFullYear(), month: now.getMonth() + 1 };
  try {
    const raw = localStorage.getItem("horas.period");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { year?: number; month?: number };
    if (parsed.year && parsed.month && parsed.month >= 1 && parsed.month <= 12) {
      return { year: parsed.year, month: parsed.month };
    }
  } catch {
    return fallback;
  }
  return fallback;
}
