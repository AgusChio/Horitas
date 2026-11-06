import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { cumulative, longDate } from "../../convex/dates";
import { OUTCOME_LABEL, RELATED_LABEL, TIPO_META, TIPO_ORDER, type Outcome, type RelatedKind, type Tipo } from "../../convex/domain";
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

const PAPER = "#fffdf8";
const INK = "#1b2430";
const SOFT = "#5c6670";

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

function sliceReport(report: ExportReport, personId: string) {
  const people = personId === "all" ? report.people : report.people.filter((person) => person._id === personId);
  const ids = new Set(people.map((person) => person._id));
  const rows = personId === "all" ? report.rows : report.rows.filter((row) => ids.has(row.userId));
  const deploys = (report.deploys ?? []).filter((deploy) => personId === "all" || ids.has(deploy.userId));
  const exitosos = deploys.filter((deploy) => deploy.outcome === "exitoso").length;
  const noExitosos = deploys.filter((deploy) => deploy.outcome === "no_exitoso").length;
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
    exitosos,
    noExitosos,
    byTipo,
    capacityInitial: people.reduce((sum, person) => sum + person.availableHours, 0),
    capacityTotal: people.reduce((sum, person) => sum + person.totalHours, 0),
    executed: people.reduce((sum, person) => sum + person.executed, 0),
  };
}

function pngBytes(canvas: HTMLCanvasElement) {
  const bytes = atob(canvas.toDataURL("image/png").split(",")[1] ?? "");
  const data = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) data[index] = bytes.charCodeAt(index);
  return data;
}

function sheet(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  return context;
}

function title(context: CanvasRenderingContext2D, text: string) {
  context.fillStyle = INK;
  context.font = "600 28px Georgia, serif";
  context.fillText(text, 36, 46);
}

function barsPng(heading: string, rows: { label: string; value: number; color: string }[]) {
  const context = sheet(1100, 460);
  if (!context) return null;
  title(context, heading);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const top = 86;
  const height = 250;
  const gap = 28;
  const width = Math.min(92, (1000 - gap * rows.length) / Math.max(rows.length, 1));
  rows.forEach((row, index) => {
    const bar = (row.value / max) * height;
    const x = 80 + index * (width + gap);
    context.fillStyle = row.color;
    context.fillRect(x, top + height - bar, width, bar);
    context.fillStyle = INK;
    context.font = "600 16px Calibri, sans-serif";
    context.fillText(String(Math.round(row.value * 10) / 10), x, top + height - bar - 8);
    context.fillStyle = SOFT;
    context.font = "15px Calibri, sans-serif";
    context.fillText(row.label, x, top + height + 24);
  });
  return pngBytes(context.canvas);
}

function piePng(heading: string, rows: { label: string; value: number; color: string }[]) {
  const context = sheet(1100, 460);
  if (!context) return null;
  title(context, heading);
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const cx = 280;
  const cy = 260;
  const radius = 150;
  let angle = -Math.PI / 2;
  for (const row of rows) {
    const slice = (row.value / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(cx, cy);
    context.arc(cx, cy, radius, angle, angle + slice);
    context.closePath();
    context.fillStyle = row.color;
    context.fill();
    angle += slice;
  }
  context.beginPath();
  context.arc(cx, cy, 72, 0, Math.PI * 2);
  context.fillStyle = PAPER;
  context.fill();
  rows.forEach((row, index) => {
    const y = 110 + index * 34;
    context.fillStyle = row.color;
    context.fillRect(560, y, 16, 16);
    context.fillStyle = INK;
    context.font = "16px Calibri, sans-serif";
    context.fillText(`${row.label} · ${Math.round(row.value * 10) / 10} h`, 586, y + 14);
  });
  return pngBytes(context.canvas);
}

function groupedPng(heading: string, people: PersonRow[]) {
  const context = sheet(Math.max(1100, 160 + people.length * 150), 480);
  if (!context) return null;
  title(context, heading);
  const series = [
    { key: "totalHours" as const, label: "Capacidad", color: "#b7c6ea" },
    { key: "regular" as const, label: "Jornada", color: "#c4622d" },
    { key: "extra" as const, label: "Extras", color: "#e08a55" },
  ];
  const max = Math.max(1, ...people.flatMap((person) => series.map((item) => person[item.key])));
  const top = 90;
  const height = 250;
  const groupWidth = 120;
  people.forEach((person, index) => {
    const origin = 70 + index * (groupWidth + 36);
    series.forEach((item, seriesIndex) => {
      const bar = (person[item.key] / max) * height;
      const x = origin + seriesIndex * 34;
      context.fillStyle = item.color;
      context.fillRect(x, top + height - bar, 28, bar);
    });
    context.fillStyle = SOFT;
    context.font = "14px Calibri, sans-serif";
    context.fillText(person.name.slice(0, 16), origin, top + height + 24);
  });
  series.forEach((item, index) => {
    const x = 70 + index * 160;
    context.fillStyle = item.color;
    context.fillRect(x, 430, 14, 14);
    context.fillStyle = INK;
    context.font = "14px Calibri, sans-serif";
    context.fillText(item.label, x + 20, 442);
  });
  return pngBytes(context.canvas);
}

function stackedPng(
  heading: string,
  labels: string[],
  series: { label: string; color: string; values: number[] }[],
) {
  const context = sheet(Math.max(1100, 140 + labels.length * 92), 520);
  if (!context) return null;
  title(context, heading);
  const max = Math.max(
    1,
    ...labels.map((_, index) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)),
  );
  const top = 80;
  const height = 280;
  const slot = Math.min(84, (context.canvas.width - 120) / Math.max(labels.length, 1));
  labels.forEach((label, index) => {
    let y = top + height;
    const x = 56 + index * slot;
    for (const row of series) {
      const bar = ((row.values[index] ?? 0) / max) * height;
      y -= bar;
      context.fillStyle = row.color;
      context.fillRect(x, y, Math.max(18, slot - 22), bar);
    }
    context.fillStyle = SOFT;
    context.font = "14px Calibri, sans-serif";
    context.fillText(label, x, top + height + 22);
  });
  series.forEach((row, index) => {
    const x = 56 + (index % 4) * 250;
    const y = 430 + Math.floor(index / 4) * 24;
    context.fillStyle = row.color;
    context.fillRect(x, y, 14, 14);
    context.fillStyle = INK;
    context.font = "14px Calibri, sans-serif";
    context.fillText(row.label, x + 20, y + 12);
  });
  return pngBytes(context.canvas);
}

function chartSet(
  view: ReturnType<typeof sliceReport>,
  weeks: Bucket[],
  bucketTitle: string,
) {
  const labels = weeks.map((week, index) => bucketName(week, index));
  return [
    barsPng("Capacidad y ejecución", [
      { label: "Inicial", value: view.capacityInitial, color: "#e7c7b0" },
      { label: "Total", value: view.capacityTotal, color: "#b7c6ea" },
      { label: "Ejecutadas", value: view.executed, color: "#c4622d" },
    ]),
    piePng(
      "Por tipo de asignación",
      view.byTipo.map((row) => ({ label: row.label, value: row.total, color: row.color })),
    ),
    groupedPng("Por persona", view.people),
    stackedPng(
      bucketTitle,
      labels,
      view.byTipo.map((row) => ({ label: row.label, color: row.color, values: row.weeks })),
    ),
    view.deploys.length > 0
      ? barsPng("Resultado de despliegues", [
          { label: "Exitosos", value: view.exitosos, color: "#2f6f5e" },
          { label: "No exitosos (rollback)", value: view.noExitosos, color: "#9f3d3d" },
        ])
      : null,
  ].filter((image): image is Uint8Array => image !== null);
}

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

function detailRows(rows: ItemRow[], mode: Mode) {
  return rows.map((row) => ({
    ...row,
    series: mode === "acumulado" ? cumulative(row.weeks) : row.weeks,
  }));
}

function imageBuffer(data: Uint8Array) {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

export async function downloadExcel(
  report: ExportReport,
  period: string,
  personId = "all",
  mode: Mode = "semana",
  bucketTitle = "Semana a semana",
) {
  const view = sliceReport(report, personId);
  const images = chartSet(view, report.weeks, bucketTitle);
  const book = new ExcelJS.Workbook();
  book.creator = "Horitas";
  const charts = book.addWorksheet("Gráficos");
  charts.getColumn(1).width = 42;
  charts.addRow(["Horitas"]);
  charts.addRow([period]);
  charts.addRow([mode === "acumulado" ? "Acumulado" : "De la semana"]);
  charts.getRow(1).font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF1B2430" } };
  images.forEach((image, index) => {
    const picture = book.addImage({ buffer: imageBuffer(image) as ExcelJS.Buffer, extension: "png" });
    charts.addImage(picture, {
      tl: { col: 0, row: 4 + index * 24 },
      ext: { width: 720, height: 300 },
    });
  });

  if (view.deploys.length > 0) {
    const deploySheet = book.addWorksheet("Despliegues");
    deploySheet.addRow(["Cambio", "Relacionado con", "Ambiente", "Fecha", "Persona", "Resultado"]);
    const deployHeader = deploySheet.getRow(1);
    deployHeader.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    deployHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2430" } };
    for (const deploy of view.deploys) {
      const cambio = deploy.ticket && deploy.name !== deploy.ticket ? `${deploy.ticket} · ${deploy.name}` : (deploy.ticket ?? deploy.name);
      const rel = deploy.relatedTicket
        ? `${deploy.relatedTicket}${deploy.relatedName ? ` · ${deploy.relatedName}` : deploy.relatedKind ? ` · ${RELATED_LABEL[deploy.relatedKind]}` : ""}`
        : "–";
      deploySheet.addRow([
        cambio,
        rel,
        deploy.environment ?? "–",
        longDate(deploy.deployDate),
        deploy.personName,
        deploy.outcome ? OUTCOME_LABEL[deploy.outcome] : "Pendiente",
      ]);
    }
    deploySheet.getColumn(1).width = 34;
    deploySheet.getColumn(2).width = 38;
    deploySheet.getColumn(3).width = 16;
    deploySheet.getColumn(4).width = 24;
    deploySheet.getColumn(5).width = 24;
    deploySheet.getColumn(6).width = 24;
  }

  const detail = book.addWorksheet("Detalle por persona");
  const headers = ["Persona", "Ítem", "Asignación", ...report.weeks.map((week, index) => bucketName(week, index)), "Total"];
  detail.addRow(headers);
  const header = detail.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2430" } };
  header.alignment = { vertical: "middle" };
  for (const group of view.byPerson) {
    for (const row of detailRows(group.rows, mode)) {
      const sub = rowSubtitle(row);
      const item = sub ? `${row.name}\n${sub}` : row.name;
      const values = [
        group.person.name,
        item,
        TIPO_META[row.tipo].asignacion,
        ...report.weeks.map((_, index) => formatHours(row.series[index] ?? 0, "–")),
        formatHours(row.total, "0"),
      ];
      const added = detail.addRow(values);
      added.alignment = { wrapText: true, vertical: "middle" };
      if (sub) added.height = 32;
    }
    const personWeekTotals = report.weeks.map((_, index) =>
      group.rows.reduce((sum, row) => sum + (row.weeks[index] ?? 0), 0),
    );
    const footerSeries = mode === "acumulado" ? cumulative(personWeekTotals) : personWeekTotals;
    const personTotal = group.rows.reduce((sum, row) => sum + row.total, 0);
    const totalRow = detail.addRow([
      `Total ${group.person.name}`,
      "",
      "",
      ...footerSeries.map((hours) => formatHours(hours, "0")),
      formatHours(personTotal, "0"),
    ]);
    totalRow.font = { bold: true };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F3EA" } };
  }
  detail.getColumn(1).width = 24;
  detail.getColumn(2).width = 38;
  detail.getColumn(3).width = 28;
  for (let column = 4; column <= headers.length; column += 1) detail.getColumn(column).width = 14;
  detail.views = [{ state: "frozen", ySplit: 1 }];
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await book.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(period)}.xlsx`,
  );
}

function wordCell(text: string, width: number, header = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: "1B2430" } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: header, color: header ? "FFFFFF" : "1B2430", size: 16 })],
      }),
    ],
  });
}

function itemCell(row: ItemRow, width: number) {
  const sub = rowSubtitle(row);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [
      new Paragraph({ children: [new TextRun({ text: row.name, bold: true, size: 16 })] }),
      ...(sub ? [new Paragraph({ children: [new TextRun({ text: sub, size: 14, color: "5C6670" })] })] : []),
    ],
  });
}

export async function downloadWord(
  report: ExportReport,
  period: string,
  personId = "all",
  mode: Mode = "semana",
  bucketTitle = "Semana a semana",
) {
  const view = sliceReport(report, personId);
  const images = chartSet(view, report.weeks, bucketTitle);
  const labels = report.weeks.map((week, index) => bucketName(week, index));
  const widths = columnWidths(labels.length);
  const header = ["Ítem", "Asignación", ...labels, "Total"];

  const personSections = view.byPerson.flatMap(({ person, rows: personRows }) => {
    const personTotal = personRows.reduce((sum, row) => sum + row.total, 0);
    const table = new Table({
      width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
      rows: [
        new TableRow({
          tableHeader: true,
          children: header.map((text, index) => wordCell(text, widths[index] ?? 800, true)),
        }),
        ...detailRows(personRows, mode).map(
          (row) =>
            new TableRow({
              children: [
                itemCell(row, widths[0] ?? 3200),
                wordCell(TIPO_META[row.tipo].asignacion, widths[1] ?? 2200),
                ...row.series.map((hours, index) => wordCell(formatHours(hours, "–"), widths[index + 2] ?? 800)),
                wordCell(formatHours(row.total, "0"), widths[widths.length - 1] ?? 900),
              ],
            }),
        ),
      ],
    });
    return [
      new Paragraph({
        text: `${person.name} (${formatHours(personTotal, "0")} h)`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
      }),
      table,
    ];
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: 15840, height: 12240 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          new Paragraph({ text: "Horitas", heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: period, italics: true, size: 22 })] }),
          new Paragraph({
            spacing: { before: 120 },
            children: [new TextRun({ text: mode === "acumulado" ? "Acumulado" : "De la semana", size: 20 })],
          }),
          ...images.flatMap((data) => [
            new Paragraph({ spacing: { before: 280 }, children: [] }),
            new Paragraph({
              children: [
                new ImageRun({
                  type: "png",
                  data,
                  transformation: { width: 640, height: 268 },
                }),
              ],
            }),
          ]),
          new Paragraph({ text: "Detalle por persona", heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
          ...personSections,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${fileBase(period)}.docx`);
}

function columnWidths(weekCount: number) {
  const page = 14400;
  const item = 3600;
  const assignment = 2400;
  const total = 900;
  const leftover = Math.max(700, page - item - assignment - total);
  const week = Math.max(700, Math.floor(leftover / Math.max(weekCount, 1)));
  return [item, assignment, ...Array.from({ length: weekCount }, () => week), total];
}
