import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (localStorage.getItem("horas.theme") === "dark") {
  document.documentElement.classList.add("dark");
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
const root = document.getElementById("root");

if (!root) {
  throw new Error("No está el contenedor de la aplicación.");
}

createRoot(root).render(
  <StrictMode>
    {convex ? (
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    ) : (
      <Configuracion />
    )}
  </StrictMode>,
);

function Configuracion() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <p className="font-display text-5xl">Horitas</p>
      <h1 className="mt-4 text-2xl font-semibold">Falta conectar Convex</h1>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        En esta carpeta corré <code className="rounded bg-white px-1">npm run dev</code> y aceptá el
        inicio de sesión de Convex. Eso crea el archivo <code className="rounded bg-white px-1">.env.local</code> con
        la dirección del backend. Después recargá esta página.
      </p>
    </main>
  );
}
