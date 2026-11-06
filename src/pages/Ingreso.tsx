import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/errors";
import { Button, ErrorDialog, Field, TextInput } from "../components/ui";

export function Ingreso() {
  const { signIn } = useAuthActions();
  const bootstrap = useQuery(api.team.bootstrap);
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (!bootstrap || seeded.current) return;
    seeded.current = true;
    if (!bootstrap.hasUsers) setFlow("signUp");
  }, [bootstrap]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    const confirm = String(new FormData(form).get("confirm") ?? "");
    if (flow === "signUp" && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    try {
      await signIn("password", new FormData(form));
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden flex-col justify-between bg-[#1b2430] px-10 py-12 text-[#f3efe6] lg:flex">
        <p className="font-display text-3xl text-[#e7c7b0]">Horitas</p>
        <div>
          <h1 className="max-w-md font-display text-6xl leading-[0.95] text-white">
            El mes, día por día.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/75">
            Reuniones, bandeja, problemas, requerimientos y despliegues. La capacidad
            descuenta los feriados de Argentina y de Colombia.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.4fr_repeat(5,1fr)] bg-white/5 text-xs">
              <div className="px-3 py-2 text-white/60">Ítem</div>
              {["Lun", "Mar", "Mié", "Jue", "Vie"].map((day) => (
                <div key={day} className="px-2 py-2 text-center text-white/50">
                  {day}
                </div>
              ))}
              {[
                ["Gestión", "2", "1", "", "3", "1"],
                ["Bandeja", "1", "2", "2", "", "4"],
                ["PPM-5528", "", "4", "3", "2", ""],
              ].map((row) =>
                row.map((cell, index) => (
                  <div
                    key={`${row[0]}-${index}`}
                    className={`border-t border-white/10 px-3 py-3 ${index === 0 ? "text-white" : "text-center text-[#e7c7b0]"}`}
                  >
                    {cell}
                  </div>
                )),
              )}
            </div>
          </div>
        </div>
        <p className="text-sm text-white/50">Planilla compartida del equipo.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <p className="font-display text-4xl lg:hidden">Horitas</p>
          <h2 className="mt-3 font-display text-4xl leading-none">
            {flow === "signIn" ? "Entrá con tu mail" : "Creá tu cuenta"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            {bootstrap && !bootstrap.hasUsers
              ? "La primera cuenta administra el equipo y puede habilitar el dominio del mail corporativo."
              : "Usá el mail del trabajo y la contraseña de esta planilla."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {flow === "signUp" && (
              <>
                <Field label="Nombre y apellido">
                  <TextInput name="name" autoComplete="name" required placeholder="Agustina Chiodini" />
                </Field>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">País</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["AR", "Argentina"],
                      ["CO", "Colombia"],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line bg-card px-3 py-3 has-[:checked]:border-copper has-[:checked]:bg-peach/40"
                      >
                        <input type="radio" name="country" value={value} required className="accent-copper" />
                        <span className="text-sm font-semibold">{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                    Define qué feriados restan de tu capacidad.
                  </p>
                </fieldset>
              </>
            )}
            <Field label="Mail">
              <TextInput
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="nombre@empresa.com"
              />
            </Field>
            <Field label="Contraseña" hint={flow === "signUp" ? "Mínimo 8 caracteres." : undefined}>
              <TextInput
                name="password"
                type="password"
                autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                required
                minLength={8}
              />
            </Field>
            {flow === "signUp" && (
              <Field label="Repetir contraseña">
                <TextInput name="confirm" type="password" autoComplete="new-password" required minLength={8} />
              </Field>
            )}
            <input type="hidden" name="flow" value={flow} />
            {error && <ErrorDialog message={error} onClose={() => setError(null)} />}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Esperá…" : flow === "signIn" ? "Entrar" : "Crear cuenta"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-5 text-sm font-semibold text-copper-dark"
            onClick={() => {
              setError(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
          >
            {flow === "signIn" ? "Necesito crear una cuenta" : "Ya tengo cuenta"}
          </button>
        </div>
      </section>
    </main>
  );
}
