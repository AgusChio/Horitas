import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { cumulative, longDate } from "../../convex/dates";
import {
  OUTCOME_LABEL,
  RELATED_LABEL,
  TIPO_META,
  TIPO_ORDER,
  type Outcome,
  type RelatedKind,
  type Tipo,
} from "../../convex/domain";
import { formatHours } from "./format";

type Bucket = { n: number; label?: string; start: number; end: number };
type PersonRow = {
  _id: string;
  name: string;
  availableHours: number;
  totalHours: number;
  regular: number;
  extra: number;
  executed: number;
};
type ItemRow = {
  name: string;
  tipo: Tipo;
  ticket: string | null;
  relatedKind?: RelatedKind | null;
  relatedTicket?: string | null;
  relatedName?: string | null;
  environment?: string | null;
  outcome?: Outcome | null;
  userId: string;
  personName: string;
  weeks: number[];
  total: number;
};
type DeployRow = {
  _id: string;
  userId: string;
  personName: string;
  outcome: Outcome | null;
  deployDate: string;
  environment: string | null;
  ticket: string | null;
  name: string;
  relatedKind: RelatedKind | null;
  relatedTicket: string | null;
  relatedName: string | null;
};

export type ExportReport = {
  weeks: Bucket[];
  people: PersonRow[];
  rows: ItemRow[];
  deploys?: DeployRow[];
};

type Mode = "semana" | "acumulado";

/** Misma paleta que la página (modo claro). */
const C = {
  paper: "#f3efe6",
  card: "#fffdf8",
  line: "#e4dccb",
  ink: "#1b2430",
  soft: "#5c6570",
  copper: "#c4622d",
  sheetSoft: "#fbf8f2",
  sheetHead: "#f7f3ea",
  peach: "#e7c7b0",
  peri: "#b7c6ea",
  extra: "#e08a55",
  green: "#2f6f5e",
  greenSoft: "#dcebe6",
  red: "#9f3d3d",
  redSoft: "#fbe4e6",
  redInk: "#9f1239",
  pending: "#c9bfae",
};

const hex = (color: string) => color.replace("#", "").toUpperCase();
const argb = (color: string) => `FF${hex(color)}`;

function bucketName(bucket: Bucket, index: number) {
  return bucket.label || `S${bucket.n || index + 1}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileBase(period: string) {
  return `horitas-${period.replace(/ /g, "-")}`;
}

function prettyPeriod(period: string) {
  const match = period.match(/^(\d{4}-\d{2}-\d{2}) a (\d{4}-\d{2}-\d{2})$/);
  if (!match || !match[1] || !match[2]) return period;
  return `Del ${longDate(match[1])} al ${longDate(match[2])}`;
}

function hours(value: number) {
  return `${formatHours(value, "0")} h`;
}

function sliceReport(report: ExportReport, personId: string) {
  const people = personId === "all" ? report.people : report.people.filter((person) => person._id === personId);
  const ids = new Set(people.map((person) => person._id));
  const rows = personId === "all" ? report.rows : report.rows.filter((row) => ids.has(row.userId));
  const deploys = (report.deploys ?? []).filter((deploy) => personId === "all" || ids.has(deploy.userId));
  const byTipo = TIPO_ORDER.map((tipo) => {
    const matching = rows.filter((row) => row.tipo === tipo);
    const weeks = report.weeks.map((_, index) => matching.reduce((sum, row) => sum + (row.weeks[index] ?? 0), 0));
    return {
      tipo,
      label: TIPO_META[tipo].asignacion,
      color: TIPO_META[tipo].dot,
      weeks,
      total: matching.reduce((sum, row) => sum + row.total, 0),
    };
  }).filter((row) => row.total > 0);
  const byPerson = people
    .map((person) => ({
      person,
      rows: rows.filter((row) => row.userId === person._id && row.total > 0),
    }))
    .filter((group) => group.rows.length > 0);
  return {
    people,
    rows,
    byPerson,
    deploys,
    exitosos: deploys.filter((deploy) => deploy.outcome === "exitoso").length,
    noExitosos: deploys.filter((deploy) => deploy.outcome === "no_exitoso").length,
    pendientes: deploys.filter((deploy) => deploy.outcome === null).length,
    byTipo,
    capacityInitial: people.reduce((sum, person) => sum + person.availableHours, 0),
    capacityTotal: people.reduce((sum, person) => sum + person.totalHours, 0),
    regular: people.reduce((sum, person) => sum + person.regular, 0),
    extra: people.reduce((sum, person) => sum + person.extra, 0),
    executed: people.reduce((sum, person) => sum + person.executed, 0),
  };
}

type View = ReturnType<typeof sliceReport>;

function rowSubtitle(row: ItemRow) {
  const parts: string[] = [];
  if (row.ticket) parts.push(row.ticket);
  if (row.relatedTicket) {
    parts.push(row.relatedName ? `→ ${row.relatedTicket} (${row.relatedName})` : `→ ${row.relatedTicket}`);
  }
  if (row.environment) parts.push(row.environment);
  if (row.outcome) parts.push(OUTCOME_LABEL[row.outcome]);
  return parts.join(" · ");
}

function series(values: number[], mode: Mode) {
  return mode === "acumulado" ? cumulative(values) : values;
}

function personSummary(person: PersonRow) {
  const bits = [`Jornada: ${hours(person.regular)}`];
  if (person.extra > 0) bits.push(`Extras: ${hours(person.extra)}`);
  bits.push(`Capacidad: ${hours(person.totalHours)}`);
  return bits.join(" · ");
}

function deployRelated(deploy: DeployRow) {
  if (!deploy.relatedTicket) return { main: "–", sub: "" };
  return {
    main: deploy.relatedTicket,
    sub: deploy.relatedName ?? (deploy.relatedKind ? RELATED_LABEL[deploy.relatedKind] : ""),
  };
}

function outcomeStyle(outcome: Outcome | null) {
  if (outcome === "exitoso") return { label: OUTCOME_LABEL.exitoso, fill: C.greenSoft, ink: C.green };
  if (outcome === "no_exitoso") return { label: OUTCOME_LABEL.no_exitoso, fill: C.redSoft, ink: C.redInk };
  return { label: "Pendiente", fill: C.paper, ink: C.soft };
}

/* ------------------------------------------------------------------ */
/* Gráficos dibujados en canvas, con el mismo estilo que la página     */
/* ------------------------------------------------------------------ */

type Chart = { data: Uint8Array; base64: string; width: number; height: number };

const SCALE = 2;
const DISPLAY = '"Fraunces", Georgia, serif';
const SANS = '"Manrope", "Segoe UI", Calibri, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function topRounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0 || w <= 0) return;
  const radius = Math.max(0, Math.min(r, w / 2, h));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function startChart(width: number, height: number, title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  roundRect(ctx, 0.5, 0.5, width - 1, height - 1, 22);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.font = `600 21px ${DISPLAY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, 22, 38);
  return ctx;
}

function finishChart(ctx: CanvasRenderingContext2D, width: number, height: number): Chart {
  const base64 = ctx.canvas.toDataURL("image/png").split(",")[1] ?? "";
  const bytes = atob(base64);
  const data = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) data[index] = bytes.charCodeAt(index);
  return { data, base64, width, height };
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function niceScale(max: number, count = 4) {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  return { top: Math.ceil(max / step) * step, step };
}

type Area = { x0: number; x1: number; y0: number; y1: number };

function drawAxis(ctx: CanvasRenderingContext2D, area: Area, top: number, step: number) {
  ctx.font = `12px ${SANS}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  for (let value = 0; value <= top + 1e-9; value += step) {
    const y = Math.round(area.y1 - (value / top) * (area.y1 - area.y0)) + 0.5;
    ctx.strokeStyle = C.line;
    ctx.setLineDash(value === 0 ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(area.x0, y);
    ctx.lineTo(area.x1, y);
    ctx.stroke();
    ctx.fillStyle = C.soft;
    ctx.fillText(formatHours(value, "0"), area.x0 - 8, y);
  }
  ctx.setLineDash([]);
}

type LegendItem = { label: string; color: string };

function legendRows(ctx: CanvasRenderingContext2D, items: LegendItem[], maxWidth: number) {
  ctx.font = `12px ${SANS}`;
  const rows: { item: LegendItem; width: number }[][] = [];
  let current: { item: LegendItem; width: number }[] = [];
  let used = 0;
  for (const item of items) {
    const width = 16 + ctx.measureText(item.label).width + 18;
    if (current.length > 0 && used + width > maxWidth) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push({ item, width });
    used += width;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function drawLegend(ctx: CanvasRenderingContext2D, rows: ReturnType<typeof legendRows>, width: number, y: number) {
  ctx.font = `12px ${SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  rows.forEach((row, rowIndex) => {
    const total = row.reduce((sum, entry) => sum + entry.width, 0) - 18;
    let x = (width - total) / 2;
    const cy = y + rowIndex * 20;
    for (const entry of row) {
      ctx.fillStyle = entry.item.color;
      ctx.beginPath();
      ctx.arc(x + 5, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.fillText(entry.item.label, x + 16, cy);
      x += entry.width;
    }
  });
}

function emptyNote(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = C.soft;
  ctx.font = `13px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Sin datos en este período", width / 2, height / 2 + 14);
}

function barChart(
  title: string,
  width: number,
  height: number,
  bars: { label: string; color: string; value: number }[],
  unit: string,
) {
  const ctx = startChart(width, height, title);
  if (!ctx) return null;
  const area = { x0: 52, x1: width - 22, y0: 66, y1: height - 42 };
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  const { top, step } = niceScale(max);
  drawAxis(ctx, area, top, step);
  const slot = (area.x1 - area.x0) / Math.max(bars.length, 1);
  const barWidth = Math.min(70, slot * 0.58);
  bars.forEach((bar, index) => {
    const x = area.x0 + slot * index + (slot - barWidth) / 2;
    const barHeight = (bar.value / top) * (area.y1 - area.y0);
    ctx.fillStyle = bar.color;
    topRounded(ctx, x, area.y1 - barHeight, barWidth, barHeight, 8);
    ctx.fillStyle = C.ink;
    ctx.font = `700 13px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${formatHours(bar.value, "0")}${unit}`, x + barWidth / 2, area.y1 - barHeight - 5);
    ctx.font = `12px ${SANS}`;
    ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, bar.label, slot - 6), x + barWidth / 2, area.y1 + 9);
  });
  if (max === 0) emptyNote(ctx, width, height);
  return finishChart(ctx, width, height);
}

function seriesChart(
  title: string,
  width: number,
  height: number,
  categories: string[],
  lines: { label: string; color: string; values: number[] }[],
  stacked: boolean,
) {
  const ctx = startChart(width, height, title);
  if (!ctx) return null;
  const legend = legendRows(ctx, lines, width - 44);
  const legendHeight = legend.length * 20;
  const area = { x0: 52, x1: width - 22, y0: 66, y1: height - 40 - legendHeight };
  const totals = categories.map((_, index) =>
    stacked
      ? lines.reduce((sum, line) => sum + (line.values[index] ?? 0), 0)
      : Math.max(0, ...lines.map((line) => line.values[index] ?? 0)),
  );
  const max = Math.max(0, ...totals);
  const { top, step } = niceScale(max);
  drawAxis(ctx, area, top, step);
  const slot = (area.x1 - area.x0) / Math.max(categories.length, 1);
  const scale = (value: number) => (value / top) * (area.y1 - area.y0);
  categories.forEach((_, index) => {
    if (stacked) {
      const barWidth = Math.min(58, slot * 0.6);
      const x = area.x0 + slot * index + (slot - barWidth) / 2;
      let base = area.y1;
      const filled = lines.filter((line) => (line.values[index] ?? 0) > 0);
      filled.forEach((line, lineIndex) => {
        const h = scale(line.values[index] ?? 0);
        ctx.fillStyle = line.color;
        if (lineIndex === filled.length - 1) topRounded(ctx, x, base - h, barWidth, h, 6);
        else ctx.fillRect(x, base - h, barWidth, h);
        base -= h;
      });
    } else {
      const group = slot * 0.74;
      const gap = 3;
      const barWidth = Math.max(4, Math.min(30, (group - gap * (lines.length - 1)) / Math.max(lines.length, 1)));
      const used = barWidth * lines.length + gap * (lines.length - 1);
      let x = area.x0 + slot * index + (slot - used) / 2;
      for (const line of lines) {
        ctx.fillStyle = line.color;
        topRounded(ctx, x, area.y1 - scale(line.values[index] ?? 0), barWidth, scale(line.values[index] ?? 0), 5);
        x += barWidth + gap;
      }
    }
  });
  ctx.font = `12px ${SANS}`;
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const every = Math.max(1, Math.ceil((categories.length * 46) / (area.x1 - area.x0)));
  categories.forEach((label, index) => {
    if (index % every !== 0) return;
    ctx.fillText(fit(ctx, label, slot * every - 6), area.x0 + slot * index + slot / 2, area.y1 + 9);
  });
  drawLegend(ctx, legend, width, height - 18 - (legend.length - 1) * 20);
  if (max === 0) emptyNote(ctx, width, height - legendHeight);
  return finishChart(ctx, width, height);
}

function donutChart(title: string, width: number, height: number, slices: { label: string; color: string; value: number }[]) {
  const ctx = startChart(width, height, title);
  if (!ctx) return null;
  const items = slices.map((slice) => ({ label: `${slice.label} · ${hours(slice.value)}`, color: slice.color }));
  const legend = legendRows(ctx, items, width - 44);
  const legendHeight = legend.length * 20;
  const top = 58;
  const bottom = height - 26 - legendHeight;
  const cx = width / 2;
  const cy = (top + bottom) / 2;
  const radius = Math.max(30, Math.min((bottom - top) / 2, 96));
  const inner = radius * 0.62;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    emptyNote(ctx, width, height);
    return finishChart(ctx, width, height);
  }
  let angle = -Math.PI / 2;
  for (const slice of slices) {
    const part = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle, angle + part);
    ctx.arc(cx, cy, inner, angle + part, angle, true);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    ctx.strokeStyle = C.card;
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += part;
  }
  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 20px ${DISPLAY}`;
  ctx.fillText(hours(total), cx, cy - 6);
  ctx.fillStyle = C.soft;
  ctx.font = `11px ${SANS}`;
  ctx.fillText("total", cx, cy + 13);
  drawLegend(ctx, legend, width, height - 18 - (legend.length - 1) * 20);
  return finishChart(ctx, width, height);
}

const SMALL = { width: 360, height: 270 };
const WIDE = { width: 1140, height: 340 };
const DEPLOY = { width: 520, height: 280 };

function buildCharts(view: View, weeks: Bucket[], bucketTitle: string) {
  const labels = weeks.map((week, index) => bucketName(week, index));
  const deployBars = [
    { label: "Exitosos", color: C.green, value: view.exitosos },
    { label: "No exitosos (rollback)", color: C.red, value: view.noExitosos },
  ];
  if (view.pendientes > 0) deployBars.push({ label: "Pendientes", color: C.pending, value: view.pendientes });
  return {
    capacity: barChart(
      "Capacidad y ejecución",
      SMALL.width,
      SMALL.height,
      [
        { label: "Inicial", color: C.peach, value: view.capacityInitial },
        { label: "Total", color: C.peri, value: view.capacityTotal },
        { label: "Ejecutadas", color: C.copper, value: view.executed },
      ],
      " h",
    ),
    tipo: donutChart(
      "Por tipo de asignación",
      SMALL.width,
      SMALL.height,
      view.byTipo.map((row) => ({ label: row.label, color: row.color, value: row.total })),
    ),
    people: seriesChart(
      "Por persona",
      SMALL.width,
      SMALL.height,
      view.people.map((person) => person.name),
      [
        { label: "Capacidad", color: C.peri, values: view.people.map((person) => person.totalHours) },
        { label: "Jornada", color: C.copper, values: view.people.map((person) => person.regular) },
        { label: "Extras", color: C.extra, values: view.people.map((person) => person.extra) },
      ],
      false,
    ),
    buckets: seriesChart(
      bucketTitle,
      WIDE.width,
      WIDE.height,
      labels,
      view.byTipo.map((row) => ({ label: row.label, color: row.color, values: row.weeks })),
      true,
    ),
    deploys: view.deploys.length > 0 ? barChart("Resultado de despliegues", DEPLOY.width, DEPLOY.height, deployBars, "") : null,
  };
}

const STATS = (view: View) => [
  { label: "Capacidad inicial", value: hours(view.capacityInitial), hint: "Antes de ausencias" },
  { label: "Capacidad total", value: hours(view.capacityTotal), hint: "Después de descuentos" },
  { label: "Jornada", value: hours(view.regular), hint: "Horas de la jornada" },
  { label: "Horas extras", value: hours(view.extra), hint: "Fuera de la jornada" },
];

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

const X_FONT = "Calibri";
const X_DISPLAY = "Georgia";
const NUM_FMT = '[=0]"–";General';

function xFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
}

function xEdge(color = C.line, style: ExcelJS.BorderStyle = "thin"): Partial<ExcelJS.Border> {
  return { style, color: { argb: argb(color) } };
}

function xFont(options: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> {
  return { name: X_FONT, size: 10, color: { argb: argb(C.ink) }, ...options };
}

function xBlock(
  ws: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  value: ExcelJS.CellValue,
  style: {
    fill?: string;
    font?: Partial<ExcelJS.Font>;
    align?: Partial<ExcelJS.Alignment>;
    border?: Partial<ExcelJS.Borders>;
    numFmt?: string;
  } = {},
) {
  for (let column = from; column <= to; column += 1) {
    const cell = ws.getCell(row, column);
    if (style.fill) cell.fill = xFill(style.fill);
    if (style.border) {
      const border: Partial<ExcelJS.Borders> = {};
      if (style.border.top) border.top = style.border.top;
      if (style.border.bottom) border.bottom = style.border.bottom;
      if (column === from && style.border.left) border.left = style.border.left;
      if (column === to && style.border.right) border.right = style.border.right;
      cell.border = border;
    }
  }
  if (to > from) ws.mergeCells(row, from, row, to);
  const master = ws.getCell(row, from);
  master.value = value;
  master.font = style.font ?? xFont();
  master.alignment = style.align ?? { vertical: "middle", wrapText: true };
  if (style.numFmt) master.numFmt = style.numFmt;
}

function rich(main: string, sub: string, bold = true): ExcelJS.CellValue {
  const parts: ExcelJS.RichText[] = [{ text: main, font: xFont({ bold }) }];
  if (sub) parts.push({ text: `\n${sub}`, font: xFont({ size: 9, color: { argb: argb(C.soft) } }) });
  return { richText: parts };
}

function xImage(book: ExcelJS.Workbook, ws: ExcelJS.Worksheet, chart: Chart | null, col: number, row: number) {
  if (!chart) return;
  const id = book.addImage({ base64: chart.base64, extension: "png" });
  ws.addImage(id, { tl: { col, row }, ext: { width: chart.width, height: chart.height } });
}

function excelSummary(
  book: ExcelJS.Workbook,
  view: View,
  charts: ReturnType<typeof buildCharts>,
  heading: string,
) {
  const ws = book.addWorksheet("Gráficos", {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: argb(C.copper) } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  for (let column = 1; column <= 12; column += 1) ws.getColumn(column).width = 13;

  xBlock(ws, 1, 1, 12, "Gráficos", { font: xFont({ name: X_DISPLAY, size: 26, bold: true }) });
  ws.getRow(1).height = 40;
  xBlock(ws, 2, 1, 12, heading, { font: xFont({ size: 11, color: { argb: argb(C.soft) } }) });
  ws.getRow(3).height = 10;

  STATS(view).forEach((stat, index) => {
    const from = index * 3 + 1;
    const to = from + 2;
    const edge = xEdge();
    xBlock(ws, 4, from, to, stat.label.toUpperCase(), {
      fill: C.card,
      font: xFont({ size: 8, bold: true, color: { argb: argb(C.soft) } }),
      align: { vertical: "bottom", indent: 1 },
      border: { top: edge, left: edge, right: edge },
    });
    xBlock(ws, 5, from, to, stat.value, {
      fill: C.card,
      font: xFont({ name: X_DISPLAY, size: 22 }),
      align: { vertical: "middle", indent: 1 },
      border: { left: edge, right: edge },
    });
    xBlock(ws, 6, from, to, stat.hint, {
      fill: C.card,
      font: xFont({ size: 9, color: { argb: argb(C.soft) } }),
      align: { vertical: "top", indent: 1 },
      border: { bottom: edge, left: edge, right: edge },
    });
  });
  ws.getRow(4).height = 20;
  ws.getRow(5).height = 34;
  ws.getRow(6).height = 20;

  xImage(book, ws, charts.capacity, 0, 7);
  xImage(book, ws, charts.tipo, 4, 7);
  xImage(book, ws, charts.people, 8, 7);
  xImage(book, ws, charts.buckets, 0, 22);

  let row = 41;
  xBlock(ws, row, 1, 12, "Despliegues", { font: xFont({ name: X_DISPLAY, size: 18, bold: true }) });
  ws.getRow(row).height = 28;
  row += 1;
  xBlock(
    ws,
    row,
    1,
    12,
    "Discriminados entre exitosos y no exitosos (que requirieron rollback), con su PR, PPM, INC o SR/SD relacionado.",
    { font: xFont({ size: 9, color: { argb: argb(C.soft) } }) },
  );
  row += 2;

  if (view.deploys.length === 0) {
    xBlock(ws, row, 1, 12, "No hay despliegues registrados en este período.", {
      fill: C.card,
      font: xFont({ color: { argb: argb(C.soft) } }),
      align: { horizontal: "center", vertical: "middle" },
      border: { top: xEdge(), bottom: xEdge(), left: xEdge(), right: xEdge() },
    });
    ws.getRow(row).height = 36;
    return;
  }

  const chips = [
    { label: `Total: ${view.deploys.length}`, fill: C.card, ink: C.ink },
    { label: `Exitosos: ${view.exitosos}`, fill: C.greenSoft, ink: C.green },
    { label: `No exitosos (rollback): ${view.noExitosos}`, fill: C.redSoft, ink: C.redInk },
    ...(view.pendientes > 0 ? [{ label: `Pendientes: ${view.pendientes}`, fill: C.paper, ink: C.soft }] : []),
  ];
  chips.forEach((chip, index) => {
    const from = index * 3 + 1;
    xBlock(ws, row, from, from + 2, chip.label, {
      fill: chip.fill,
      font: xFont({ bold: true, color: { argb: argb(chip.ink) } }),
      align: { horizontal: "center", vertical: "middle" },
      border: { top: xEdge(), bottom: xEdge(), left: xEdge(), right: xEdge() },
    });
  });
  ws.getRow(row).height = 24;
  row += 2;

  xImage(book, ws, charts.deploys, 0, row - 1);
  row += Math.ceil(DEPLOY.height / 20) + 1;

  const groups: [number, number, string][] = [
    [1, 3, "Cambio"],
    [4, 6, "Relacionado con"],
    [7, 7, "Ambiente"],
    [8, 9, "Fecha"],
    [10, 11, "Persona"],
    [12, 12, "Resultado"],
  ];
  for (const [from, to, label] of groups) {
    xBlock(ws, row, from, to, label.toUpperCase(), {
      fill: C.paper,
      font: xFont({ size: 8, bold: true, color: { argb: argb(C.soft) } }),
      align: { vertical: "middle", indent: 1 },
      border: { top: xEdge(), bottom: xEdge() },
    });
  }
  ws.getRow(row).height = 24;
  row += 1;
  for (const deploy of view.deploys) {
    const related = deployRelated(deploy);
    const result = outcomeStyle(deploy.outcome);
    const cambioSub = deploy.ticket && deploy.name !== deploy.ticket ? deploy.name : "";
    const values: ExcelJS.CellValue[] = [
      rich(deploy.ticket ?? deploy.name, cambioSub),
      rich(related.main, related.sub),
      deploy.environment ?? "–",
      longDate(deploy.deployDate),
      deploy.personName,
    ];
    groups.slice(0, 5).forEach(([from, to], index) => {
      xBlock(ws, row, from, to, values[index] ?? "", {
        fill: C.card,
        align: { vertical: "middle", wrapText: true, indent: 1 },
        border: { bottom: xEdge() },
      });
    });
    xBlock(ws, row, 12, 12, result.label, {
      fill: result.fill,
      font: xFont({ bold: true, size: 9, color: { argb: argb(result.ink) } }),
      align: { horizontal: "center", vertical: "middle", wrapText: true },
      border: { bottom: xEdge() },
    });
    ws.getRow(row).height = 32;
    row += 1;
  }
}

function excelDetail(book: ExcelJS.Workbook, view: View, weeks: Bucket[], mode: Mode, note: string) {
  const ws = book.addWorksheet("Detalle por persona", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const labels = weeks.map((week, index) => bucketName(week, index));
  const last = labels.length + 3;
  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 26;
  for (let column = 3; column < last; column += 1) ws.getColumn(column).width = 10;
  ws.getColumn(last).width = 12;

  xBlock(ws, 1, 1, last, "Detalle por persona", { font: xFont({ name: X_DISPLAY, size: 22, bold: true }) });
  ws.getRow(1).height = 34;
  xBlock(
    ws,
    2,
    1,
    last,
    `Separado por cada integrante del equipo · ${mode === "acumulado" ? "Acumulado" : "De la semana"}`,
    { font: xFont({ size: 10, color: { argb: argb(C.soft) } }) },
  );

  let row = 4;
  for (const { person, rows } of view.byPerson) {
    const total = rows.reduce((sum, item) => sum + item.total, 0);
    const edge = xEdge();
    xBlock(ws, row, 1, last - 1, person.name, {
      fill: C.sheetSoft,
      font: xFont({ name: X_DISPLAY, size: 15, bold: true }),
      align: { vertical: "bottom", indent: 1 },
      border: { top: edge, left: edge },
    });
    xBlock(ws, row, last, last, `Total: ${hours(total)}`, {
      fill: C.ink,
      font: xFont({ bold: true, size: 9, color: { argb: argb(C.card) } }),
      align: { horizontal: "center", vertical: "middle" },
      border: { top: edge, right: edge },
    });
    ws.getRow(row).height = 26;
    row += 1;
    xBlock(ws, row, 1, last, personSummary(person), {
      fill: C.sheetSoft,
      font: xFont({ size: 9, color: { argb: argb(C.soft) } }),
      align: { vertical: "top", indent: 1 },
      border: { bottom: edge, left: edge, right: edge },
    });
    ws.getRow(row).height = 20;
    row += 1;

    const headers = ["Ítem", "Asignación", ...labels, "Total"];
    headers.forEach((label, index) => {
      const column = index + 1;
      xBlock(ws, row, column, column, label.toUpperCase(), {
        fill: C.paper,
        font: xFont({ size: 8, bold: true, color: { argb: argb(C.soft) } }),
        align: { vertical: "middle", horizontal: column <= 2 ? "left" : "center", indent: column <= 2 ? 1 : 0 },
        border: { bottom: edge, left: column === 1 ? edge : undefined, right: column === last ? edge : undefined },
      });
    });
    ws.getRow(row).height = 22;
    row += 1;

    for (const item of rows) {
      const meta = TIPO_META[item.tipo];
      const subtitle = rowSubtitle(item);
      xBlock(ws, row, 1, 1, rich(item.name, subtitle), {
        fill: C.card,
        align: { vertical: "middle", wrapText: true, indent: 1 },
        border: { bottom: edge, left: xEdge(meta.dot, "thick") },
      });
      xBlock(
        ws,
        row,
        2,
        2,
        { richText: [{ text: "● ", font: xFont({ color: { argb: argb(meta.dot) } }) }, { text: meta.asignacion, font: xFont() }] },
        { fill: C.card, border: { bottom: edge } },
      );
      series(item.weeks, mode).forEach((value, index) => {
        xBlock(ws, row, index + 3, index + 3, value, {
          fill: C.card,
          numFmt: NUM_FMT,
          align: { horizontal: "center", vertical: "middle" },
          border: { bottom: edge },
        });
      });
      xBlock(ws, row, last, last, item.total, {
        fill: C.card,
        numFmt: NUM_FMT,
        font: xFont({ bold: true }),
        align: { horizontal: "center", vertical: "middle" },
        border: { bottom: edge, right: edge },
      });
      ws.getRow(row).height = subtitle ? 32 : 22;
      row += 1;
    }

    const weekTotals = labels.map((_, index) => rows.reduce((sum, item) => sum + (item.weeks[index] ?? 0), 0));
    xBlock(ws, row, 1, 2, `Total ${person.name}`, {
      fill: C.sheetHead,
      font: xFont({ bold: true }),
      align: { vertical: "middle", indent: 1 },
      border: { bottom: edge, left: edge },
    });
    series(weekTotals, mode).forEach((value, index) => {
      xBlock(ws, row, index + 3, index + 3, value, {
        fill: C.sheetHead,
        numFmt: NUM_FMT,
        font: xFont({ bold: true }),
        align: { horizontal: "center", vertical: "middle" },
        border: { bottom: edge },
      });
    });
    xBlock(ws, row, last, last, total, {
      fill: C.sheetHead,
      numFmt: NUM_FMT,
      font: xFont({ bold: true }),
      align: { horizontal: "center", vertical: "middle" },
      border: { bottom: edge, right: edge },
    });
    ws.getRow(row).height = 22;
    row += 3;
  }

  xBlock(ws, row, 1, last, note, { font: xFont({ size: 9, color: { argb: argb(C.soft) } }) });
}

function detailNote(weeks: Bucket[], bucketTitle: string) {
  return bucketTitle === "Semana a semana"
    ? `S1 a S${weeks.length} van de lunes a domingo dentro del mes. El acumulado suma cada columna con las anteriores.`
    : "Cada columna sigue el rango elegido. El acumulado suma cada columna con las anteriores.";
}

function headingFor(view: View, period: string, personId: string) {
  const who = personId === "all" ? "Todo el equipo" : (view.people[0]?.name ?? "Persona");
  return `Horitas · ${prettyPeriod(period)} · ${who}`;
}

export async function downloadExcel(
  report: ExportReport,
  period: string,
  personId = "all",
  mode: Mode = "semana",
  bucketTitle = "Semana a semana",
) {
  const view = sliceReport(report, personId);
  const charts = buildCharts(view, report.weeks, bucketTitle);
  const book = new ExcelJS.Workbook();
  book.creator = "Horitas";
  book.created = new Date();
  excelSummary(book, view, charts, headingFor(view, period, personId));
  excelDetail(book, view, report.weeks, mode, detailNote(report.weeks, bucketTitle));
  const buffer = await book.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(period)}.xlsx`,
  );
}

/* ------------------------------------------------------------------ */
/* Word                                                                */
/* ------------------------------------------------------------------ */

const W_FONT = "Calibri";
const W_DISPLAY = "Georgia";
const PAGE_WIDTH = 13680;
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const LINE = { style: BorderStyle.SINGLE, size: 4, color: hex(C.line) };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

function wRun(
  text: string,
  options: { bold?: boolean; size?: number; color?: string; font?: string; italics?: boolean; fill?: string } = {},
) {
  return new TextRun({
    text,
    bold: options.bold,
    italics: options.italics,
    size: options.size ?? 18,
    color: hex(options.color ?? C.ink),
    font: options.font ?? W_FONT,
    shading: options.fill ? { type: ShadingType.CLEAR, color: "auto", fill: hex(options.fill) } : undefined,
  });
}

function wPara(
  children: TextRun[],
  options: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {},
) {
  return new Paragraph({
    children,
    alignment: options.align,
    spacing: { before: options.before ?? 0, after: options.after ?? 0 },
  });
}

function wCell(
  children: Paragraph[],
  width: number,
  options: {
    fill?: string;
    borders?: { top?: typeof LINE; bottom?: typeof LINE; left?: typeof LINE; right?: typeof LINE };
    span?: number;
    margins?: number;
    padX?: number;
    align?: typeof VerticalAlign.TOP | typeof VerticalAlign.CENTER | typeof VerticalAlign.BOTTOM;
  } = {},
) {
  const margin = options.margins ?? 100;
  const padX = options.padX ?? margin + 40;
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.span,
    verticalAlign: options.align ?? VerticalAlign.CENTER,
    shading: options.fill ? { type: ShadingType.CLEAR, color: "auto", fill: hex(options.fill) } : undefined,
    margins: { top: margin, bottom: margin, left: padX, right: padX },
    borders: {
      top: options.borders?.top ?? NONE,
      bottom: options.borders?.bottom ?? NONE,
      left: options.borders?.left ?? NONE,
      right: options.borders?.right ?? NONE,
    },
  });
}

function wTable(columnWidths: number[], rows: TableRow[]) {
  return new Table({
    width: { size: columnWidths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows,
  });
}

function wImage(chart: Chart | null, width: number) {
  if (!chart) return wPara([]);
  const height = Math.round((chart.height / chart.width) * width);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type: "png", data: chart.data, transformation: { width, height } })],
  });
}

function wHeading(text: string, before = 360) {
  return wPara([wRun(text, { font: W_DISPLAY, size: 36, bold: true })], { before, after: 60 });
}

function wNote(text: string, after = 160) {
  return wPara([wRun(text, { size: 16, color: C.soft })], { after });
}

function wStats(view: View) {
  const gap = 200;
  const card = Math.floor((PAGE_WIDTH - gap * 3) / 4);
  const widths: number[] = [];
  const cells: TableCell[] = [];
  STATS(view).forEach((stat, index) => {
    if (index > 0) {
      widths.push(gap);
      cells.push(wCell([wPara([])], gap, { margins: 0, padX: 0 }));
    }
    widths.push(card);
    cells.push(
      wCell(
        [
          wPara([wRun(stat.label.toUpperCase(), { size: 14, bold: true, color: C.soft })]),
          wPara([wRun(stat.value, { font: W_DISPLAY, size: 38 })], { before: 40 }),
          wPara([wRun(stat.hint, { size: 15, color: C.soft })], { before: 40 }),
        ],
        card,
        { fill: C.card, borders: { top: LINE, bottom: LINE, left: LINE, right: LINE }, margins: 120, padX: 140 },
      ),
    );
  });
  return wTable(widths, [new TableRow({ children: cells })]);
}

function wChartRow(charts: ReturnType<typeof buildCharts>) {
  const column = Math.floor(PAGE_WIDTH / 3);
  const pixels = 285;
  return wTable(
    [column, column, column],
    [
      new TableRow({
        children: [charts.capacity, charts.tipo, charts.people].map((chart) =>
          wCell([wImage(chart, pixels)], column, { margins: 20, padX: 10 }),
        ),
      }),
    ],
  );
}

function wDeploys(view: View, charts: ReturnType<typeof buildCharts>) {
  const blocks: (Paragraph | Table)[] = [
    wHeading("Despliegues"),
    wNote("Discriminados entre exitosos y no exitosos (que requirieron rollback), con su PR, PPM, INC o SR/SD relacionado."),
  ];
  if (view.deploys.length === 0) {
    blocks.push(
      wTable(
        [PAGE_WIDTH],
        [
          new TableRow({
            children: [
              wCell([wPara([wRun("No hay despliegues registrados en este período.", { color: C.soft })], { align: AlignmentType.CENTER })], PAGE_WIDTH, {
                fill: C.card,
                borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
                margins: 200,
              }),
            ],
          }),
        ],
      ),
    );
    return blocks;
  }
  const chips = [
    wRun(`  Total: ${view.deploys.length}  `, { bold: true, size: 16, fill: C.paper }),
    wRun("   "),
    wRun(`  Exitosos: ${view.exitosos}  `, { bold: true, size: 16, color: C.green, fill: C.greenSoft }),
    wRun("   "),
    wRun(`  No exitosos (rollback): ${view.noExitosos}  `, { bold: true, size: 16, color: C.redInk, fill: C.redSoft }),
  ];
  if (view.pendientes > 0) {
    chips.push(wRun("   "), wRun(`  Pendientes: ${view.pendientes}  `, { bold: true, size: 16, color: C.soft, fill: C.paper }));
  }
  blocks.push(wPara(chips, { after: 160 }));
  blocks.push(wImage(charts.deploys, 440));
  blocks.push(wPara([], { after: 120 }));

  const widths = [2700, 3100, 1400, 2400, 2200, 1880];
  const headers = ["Cambio", "Relacionado con", "Ambiente", "Fecha", "Persona", "Resultado"];
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((label, index) =>
      wCell([wPara([wRun(label.toUpperCase(), { size: 14, bold: true, color: C.soft })])], widths[index] ?? 1500, {
        fill: C.paper,
        borders: { top: LINE, bottom: LINE },
      }),
    ),
  });
  const rows = view.deploys.map((deploy) => {
    const related = deployRelated(deploy);
    const result = outcomeStyle(deploy.outcome);
    const cambioSub = deploy.ticket && deploy.name !== deploy.ticket ? deploy.name : "";
    const twoLines = (main: string, sub: string) => [
      wPara([wRun(main, { bold: true, size: 17 })]),
      ...(sub ? [wPara([wRun(sub, { size: 15, color: C.soft })])] : []),
    ];
    const border = { bottom: LINE };
    return new TableRow({
      children: [
        wCell(twoLines(deploy.ticket ?? deploy.name, cambioSub), widths[0] ?? 2700, { fill: C.card, borders: border }),
        wCell(twoLines(related.main, related.sub), widths[1] ?? 3100, { fill: C.card, borders: border }),
        wCell([wPara([wRun(deploy.environment ?? "–", { size: 17 })])], widths[2] ?? 1400, { fill: C.card, borders: border }),
        wCell([wPara([wRun(longDate(deploy.deployDate), { size: 17 })])], widths[3] ?? 2400, { fill: C.card, borders: border }),
        wCell([wPara([wRun(deploy.personName, { size: 17 })])], widths[4] ?? 2200, { fill: C.card, borders: border }),
        wCell(
          [wPara([wRun(result.label, { bold: true, size: 15, color: result.ink })], { align: AlignmentType.CENTER })],
          widths[5] ?? 1880,
          { fill: result.fill, borders: border },
        ),
      ],
    });
  });
  blocks.push(wTable(widths, [headerRow, ...rows]));
  return blocks;
}

function detailWidths(count: number) {
  const safeCount = Math.max(count, 1);
  const item = safeCount > 14 ? 2500 : safeCount > 6 ? 3200 : 4000;
  const assignment = safeCount > 14 ? 1500 : safeCount > 6 ? 1800 : 2200;
  const total = safeCount > 14 ? 800 : 950;
  const remaining = PAGE_WIDTH - item - assignment - total;
  const week = Math.floor(remaining / safeCount);
  const extra = remaining - week * safeCount;
  return [item + extra, assignment, ...Array.from({ length: count }, () => week), total];
}

function wPersonBlocks(view: View, weeks: Bucket[], mode: Mode) {
  const labels = weeks.map((week, index) => bucketName(week, index));
  const widths = detailWidths(labels.length);
  const full = widths.reduce((sum, width) => sum + width, 0);
  const compact = labels.length > 10;
  const numberSize = labels.length > 14 ? 13 : 16;
  const numPadX = compact ? 15 : 50;
  const blocks: (Paragraph | Table)[] = [];
  for (const { person, rows } of view.byPerson) {
    const total = rows.reduce((sum, item) => sum + item.total, 0);
    const pill = 2200;
    blocks.push(
      wTable(
        [full - pill, pill],
        [
          new TableRow({
            children: [
              wCell(
                [
                  wPara([wRun(person.name, { font: W_DISPLAY, size: 30, bold: true })]),
                  wPara([wRun(personSummary(person), { size: 16, color: C.soft })], { before: 40 }),
                ],
                full - pill,
                { fill: C.sheetSoft, borders: { top: LINE, left: LINE, bottom: LINE }, margins: 120 },
              ),
              wCell(
                [wPara([wRun(`Total: ${hours(total)}`, { bold: true, size: 16, color: C.card })], { align: AlignmentType.CENTER })],
                pill,
                { fill: C.ink, borders: { top: LINE, right: LINE, bottom: LINE } },
              ),
            ],
          }),
        ],
      ),
    );
    const headerRow = new TableRow({
      tableHeader: true,
      children: ["Ítem", "Asignación", ...labels, "Total"].map((label, index) =>
        wCell(
          [
            wPara([wRun(label.toUpperCase(), { size: compact && index > 1 ? 11 : 13, bold: true, color: C.soft })], {
              align: index <= 1 ? AlignmentType.LEFT : AlignmentType.CENTER,
            }),
          ],
          widths[index] ?? 600,
          {
            fill: C.paper,
            margins: 65,
            padX: index <= 1 ? 80 : numPadX,
            borders: { bottom: LINE, left: index === 0 ? LINE : undefined, right: index === widths.length - 1 ? LINE : undefined },
          },
        ),
      ),
    });
    const itemRows = rows.map((item) => {
      const meta = TIPO_META[item.tipo];
      const subtitle = rowSubtitle(item);
      const values = series(item.weeks, mode);
      return new TableRow({
        children: [
          wCell(
            [
              wPara([wRun(item.name, { bold: true, size: 16 })]),
              ...(subtitle ? [wPara([wRun(subtitle, { size: 14, color: C.soft })])] : []),
            ],
            widths[0] ?? 4000,
            {
              fill: C.card,
              margins: 65,
              padX: 80,
              borders: { bottom: LINE, left: { style: BorderStyle.SINGLE, size: 24, color: hex(meta.dot) } },
            },
          ),
          wCell(
            [wPara([wRun("● ", { size: 16, color: meta.dot }), wRun(meta.asignacion, { size: 16 })])],
            widths[1] ?? 2200,
            { fill: C.card, margins: 65, padX: 80, borders: { bottom: LINE } },
          ),
          ...values.map((value, index) =>
            wCell(
              [wPara([wRun(formatHours(value, "–"), { size: numberSize })], { align: AlignmentType.CENTER })],
              widths[index + 2] ?? 600,
              { fill: C.card, margins: 50, padX: numPadX, borders: { bottom: LINE } },
            ),
          ),
          wCell(
            [wPara([wRun(formatHours(item.total, "0"), { size: numberSize, bold: true })], { align: AlignmentType.CENTER })],
            widths[widths.length - 1] ?? 950,
            { fill: C.card, margins: 50, padX: numPadX, borders: { bottom: LINE, right: LINE } },
          ),
        ],
      });
    });
    const weekTotals = series(
      labels.map((_, index) => rows.reduce((sum, item) => sum + (item.weeks[index] ?? 0), 0)),
      mode,
    );
    const totalRow = new TableRow({
      children: [
        wCell([wPara([wRun(`Total ${person.name}`, { bold: true, size: 16 })])], (widths[0] ?? 0) + (widths[1] ?? 0), {
          span: 2,
          fill: C.sheetHead,
          margins: 65,
          padX: 80,
          borders: { bottom: LINE, left: LINE },
        }),
        ...weekTotals.map((value, index) =>
          wCell(
            [wPara([wRun(formatHours(value, "0"), { size: numberSize, bold: true })], { align: AlignmentType.CENTER })],
            widths[index + 2] ?? 600,
            { fill: C.sheetHead, margins: 50, padX: numPadX, borders: { bottom: LINE } },
          ),
        ),
        wCell(
          [wPara([wRun(formatHours(total, "0"), { size: numberSize, bold: true })], { align: AlignmentType.CENTER })],
          widths[widths.length - 1] ?? 950,
          { fill: C.sheetHead, margins: 50, padX: numPadX, borders: { bottom: LINE, right: LINE } },
        ),
      ],
    });
    blocks.push(wTable(widths, [headerRow, ...itemRows, totalRow]));
    blocks.push(wPara([], { after: 280 }));
  }
  return blocks;
}

export async function downloadWord(
  report: ExportReport,
  period: string,
  personId = "all",
  mode: Mode = "semana",
  bucketTitle = "Semana a semana",
) {
  const view = sliceReport(report, personId);
  const charts = buildCharts(view, report.weeks, bucketTitle);

  const doc = new Document({
    creator: "Horitas",
    title: "Horitas · Gráficos",
    styles: { default: { document: { run: { font: W_FONT, size: 18, color: hex(C.ink) } } } },
    sections: [
      {
        properties: {
          page: {
            // docx swaps width & height when PageOrientation.LANDSCAPE is set, so pass portrait dimensions (8.5" x 11")
            size: { orientation: PageOrientation.LANDSCAPE, width: 12240, height: 15840 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          wPara([wRun("Gráficos", { font: W_DISPLAY, size: 52, bold: true })]),
          wNote(headingFor(view, period, personId), 240),
          wStats(view),
          wPara([], { after: 200 }),
          wChartRow(charts),
          wPara([], { after: 120 }),
          wImage(charts.buckets, 880),
          ...wDeploys(view, charts),
          wHeading("Detalle por persona", 480),
          wNote(
            `Separado por cada integrante del equipo para leer las asignaciones sin mezclarlas · ${
              mode === "acumulado" ? "Acumulado" : "De la semana"
            }`,
          ),
          ...wPersonBlocks(view, report.weeks, mode),
          wNote(detailNote(report.weeks, bucketTitle)),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${fileBase(period)}.docx`);
}
