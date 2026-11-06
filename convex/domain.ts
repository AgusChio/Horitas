import { ConvexError } from "convex/values";

export const TIPO_ORDER = [
  "bandeja",
  "gestion",
  "cierre",
  "problema",
  "requerimiento",
  "despliegue",
] as const;

export type Tipo = (typeof TIPO_ORDER)[number];
export type Country = "AR" | "CO";

export const TIPO_META: Record<
  Tipo,
  { label: string; asignacion: string; description: string; dot: string }
> = {
  bandeja: {
    label: "Bandeja",
    asignacion: "Atención",
    description: "Incidentes y service request",
    dot: "#3d7ea6",
  },
  gestion: {
    label: "Gestión",
    asignacion: "Gestión",
    description: "Reuniones y seguimiento",
    dot: "#2f6f5e",
  },
  cierre: {
    label: "Cierre financiero",
    asignacion: "Cierre financiero",
    description: "Cierre del mes",
    dot: "#c4622d",
  },
  problema: {
    label: "Problema",
    asignacion: "Problemas",
    description: "PR",
    dot: "#a23b68",
  },
  requerimiento: {
    label: "Requerimiento",
    asignacion: "Requerimientos",
    description: "PPM",
    dot: "#a67914",
  },
  despliegue: {
    label: "Despliegue",
    asignacion: "Despliegue",
    description: "Salida a un ambiente",
    dot: "#9f3d3d",
  },
};

export function isTipo(value: string): value is Tipo {
  return (TIPO_ORDER as readonly string[]).includes(value);
}

export function roundHours(value: number) {
  return Math.round(value * 4) / 4;
}

export function normalizeItem(input: {
  tipo: string;
  name: string;
  ticket?: string | null;
  deployDate?: string | null;
  environment?: string | null;
  notes?: string | null;
}) {
  if (!isTipo(input.tipo)) throw new ConvexError("Elegí un tipo de ítem.");
  const tipo = input.tipo;
  let ticket = (input.ticket ?? "").trim().toUpperCase().replace(/\s+/g, "");

  if (tipo === "problema") {
    const match = ticket.match(/^(?:PR-?)?(\d{2,})$/);
    if (!match) {
      throw new ConvexError("El problema necesita el número de PR. Por ejemplo, PR-961.");
    }
    ticket = `PR-${match[1]}`;
  } else if (tipo === "requerimiento") {
    const match = ticket.match(/^(?:PPM-?)?(\d{2,})$/);
    if (!match) {
      throw new ConvexError(
        "El requerimiento necesita el número de PPM. Por ejemplo, PPM-5528.",
      );
    }
    ticket = `PPM-${match[1]}`;
  } else if (tipo === "gestion" || tipo === "cierre") {
    ticket = "";
  } else if (ticket && !/^[A-Z0-9-]{2,40}$/.test(ticket)) {
    throw new ConvexError("El ticket solo puede tener letras, números y guiones.");
  }

  let name = input.name.trim().replace(/\s+/g, " ");
  if (!name) {
    if (tipo === "bandeja") name = "Incidentes & Service Request";
    else if (tipo === "gestion") name = "Gestión";
    else if (tipo === "cierre") name = "Cierre financiero";
    else name = ticket || "Despliegue";
  }
  if (name.length > 140) throw new ConvexError("El nombre es demasiado largo.");

  let deployDate: string | null = null;
  let environment: string | null = null;
  if (tipo === "despliegue") {
    const rawDate = (input.deployDate ?? "").trim();
    if (rawDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        throw new ConvexError("La fecha de despliegue no es válida.");
      }
      deployDate = rawDate;
    }
    const environmentName = (input.environment ?? "").trim();
    if (environmentName) environment = environmentName.slice(0, 40);
  }

  const notes = (input.notes ?? "").trim();
  return {
    tipo,
    name,
    ticket: ticket || null,
    deployDate,
    environment,
    notes: notes ? notes.slice(0, 500) : null,
  };
}

export function sameItem(
  left: { tipo: Tipo; name: string; ticket: string | null },
  right: { tipo: Tipo; name: string; ticket: string | null },
) {
  if (left.tipo !== right.tipo) return false;
  if (left.ticket && right.ticket) return left.ticket === right.ticket;
  return left.name.toLocaleLowerCase("es") === right.name.toLocaleLowerCase("es");
}
