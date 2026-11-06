import { ConvexError } from "convex/values";
import { isIsoDate } from "./dates";

export const TIPO_ORDER = [
  "bandeja",
  "gestion",
  "documentacion",
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
    label: "Incidente/Service Request",
    asignacion: "Incidente/Service Request",
    description: "Incidentes y service request",
    dot: "#3d7ea6",
  },
  gestion: {
    label: "Reuniones",
    asignacion: "Reuniones",
    description: "Reuniones y seguimiento",
    dot: "#2f6f5e",
  },
  documentacion: {
    label: "Documentación",
    asignacion: "Documentación",
    description: "Manuales, actas y documentos",
    dot: "#5c4d8a",
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
    description: "Un día, a QAM o producción",
    dot: "#9f3d3d",
  },
};

export const RELATED_KINDS = ["requerimiento", "problema", "incidente", "service"] as const;
export type RelatedKind = (typeof RELATED_KINDS)[number];
export const OUTCOMES = ["exitoso", "no_exitoso", "rollback"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const DEPLOY_ENVIRONMENTS = ["QAM", "Producción"] as const;

export const RELATED_LABEL: Record<RelatedKind, string> = {
  requerimiento: "Requerimiento",
  problema: "Problema",
  incidente: "Incidente",
  service: "Service request",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  exitoso: "Exitoso",
  no_exitoso: "No exitoso",
  rollback: "Con rollback",
};

export function isRelatedKind(value: string): value is RelatedKind {
  return (RELATED_KINDS as readonly string[]).includes(value);
}

export function isOutcome(value: string): value is Outcome {
  return (OUTCOMES as readonly string[]).includes(value);
}

export function canClose(tipo: Tipo) {
  return tipo === "problema" || tipo === "requerimiento" || tipo === "bandeja";
}

export function closedBeforeMonth(endedOn: string | null | undefined, year: number, month: number) {
  if (!endedOn) return false;
  const [endYear, endMonth] = endedOn.split("-").map(Number);
  if (!endYear || !endMonth) return false;
  return year > endYear || (year === endYear && month > endMonth);
}

export function isTipo(value: string): value is Tipo {
  return (TIPO_ORDER as readonly string[]).includes(value);
}

export function roundHours(value: number) {
  return Math.round(value * 4) / 4;
}

function numberedTicket(ticket: string, prefix: string, example: string, message: string) {
  const match = ticket.match(new RegExp(`^(?:${prefix}-?)?(\\d{2,})$`));
  if (!match) throw new ConvexError(message.replace("{ejemplo}", example));
  return `${prefix}-${match[1]}`;
}

export function normalizeItem(input: {
  tipo: string;
  name: string;
  ticket?: string | null;
  deployDate?: string | null;
  environment?: string | null;
  notes?: string | null;
  endedOn?: string | null;
  relatedKind?: string | null;
  relatedTicket?: string | null;
  outcome?: string | null;
}) {
  if (!isTipo(input.tipo)) throw new ConvexError("Elegí un tipo de ítem.");
  const tipo = input.tipo;
  let ticket = (input.ticket ?? "").trim().toUpperCase().replace(/\s+/g, "");
  let relatedKind: RelatedKind | null = null;
  let relatedTicket: string | null = null;
  let outcome: Outcome | null = null;
  let deployDate: string | null = null;
  let environment: string | null = null;
  let endedOn: string | null = null;

  if (tipo === "problema") {
    ticket = numberedTicket(
      ticket,
      "PR",
      "PR-961",
      "El problema necesita el número de PR. Por ejemplo, {ejemplo}.",
    );
  } else if (tipo === "requerimiento") {
    ticket = numberedTicket(
      ticket,
      "PPM",
      "PPM-5528",
      "El requerimiento necesita el número de PPM. Por ejemplo, {ejemplo}.",
    );
  } else if (tipo === "despliegue") {
    const change = ticket.match(/^(?:CH-?)?(\d{3,8})$/);
    if (!change) {
      throw new ConvexError("El despliegue necesita el número de cambio. Por ejemplo, CH-0000.");
    }
    ticket = `CH-${change[1]}`;
    const rawDate = (input.deployDate ?? "").trim();
    if (!isIsoDate(rawDate)) {
      throw new ConvexError("El despliegue dura un solo día. Elegí la fecha del cambio.");
    }
    deployDate = rawDate;
    const environmentName = (input.environment ?? "").trim();
    if (environmentName !== "QAM" && environmentName !== "Producción") {
      throw new ConvexError("Elegí el ambiente: QAM o Producción.");
    }
    environment = environmentName;
    const kind = (input.relatedKind ?? "").trim();
    if (!isRelatedKind(kind)) {
      throw new ConvexError(
        "Indicá si el cambio sale de un requerimiento, un problema, un incidente o un service request.",
      );
    }
    relatedKind = kind;
    const linked = (input.relatedTicket ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (kind === "requerimiento") {
      relatedTicket = numberedTicket(linked, "PPM", "PPM-5528", "El requerimiento relacionado necesita un PPM. Por ejemplo, {ejemplo}.");
    } else if (kind === "problema") {
      relatedTicket = numberedTicket(linked, "PR", "PR-961", "El problema relacionado necesita un PR. Por ejemplo, {ejemplo}.");
    } else if (kind === "incidente") {
      relatedTicket = numberedTicket(linked, "INC", "INC-1024", "El incidente relacionado necesita un número. Por ejemplo, {ejemplo}.");
    } else {
      relatedTicket = numberedTicket(linked, "SR", "SR-204", "El service request relacionado necesita un número. Por ejemplo, {ejemplo}.");
    }
    const result = (input.outcome ?? "").trim();
    if (result) {
      if (!isOutcome(result)) {
        throw new ConvexError("El resultado tiene que ser exitoso, no exitoso o con rollback.");
      }
      outcome = result;
    }
  } else if (tipo === "gestion" || tipo === "cierre" || tipo === "documentacion") {
    ticket = "";
  } else if (ticket && !/^[A-Z0-9-]{2,40}$/.test(ticket)) {
    throw new ConvexError("El ticket solo puede tener letras, números y guiones.");
  }

  if (canClose(tipo)) {
    const rawEnd = (input.endedOn ?? "").trim();
    if (rawEnd) {
      if (!isIsoDate(rawEnd)) throw new ConvexError("La fecha de terminado no es válida.");
      endedOn = rawEnd;
    }
  }

  let name = input.name.trim().replace(/\s+/g, " ");
  if (!name) {
    if (tipo === "bandeja") name = "Incidente/Service Request";
    else if (tipo === "gestion") name = "Reuniones";
    else if (tipo === "documentacion") name = "Documentación";
    else if (tipo === "cierre") name = "Cierre financiero";
    else name = ticket || "Despliegue";
  }
  if (name.length > 140) throw new ConvexError("El nombre es demasiado largo.");

  const notes = (input.notes ?? "").trim();
  return {
    tipo,
    name,
    ticket: ticket || null,
    deployDate,
    environment,
    notes: notes ? notes.slice(0, 500) : null,
    endedOn,
    relatedKind,
    relatedTicket,
    outcome,
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
