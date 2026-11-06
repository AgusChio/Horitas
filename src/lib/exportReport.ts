import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { TIPO_META, type Tipo } from "../../convex/domain";

type Bucket = { n: number; label?: string; start: number; end: number };
type PersonRow = {
  _id: string;
  name: string;
  totalHours: number;
  regular: number;
  extra: number;
  executed: number;
};
type ItemRow = {
  name: string;
  tipo: Tipo;
  ticket: string | null;
  userId: string;
  personName: string;
  weeks: number[];
  total: number;
};

export type ExportReport = {
  weeks: Bucket[];
  people: PersonRow[];
  rows: ItemRow[];
  capacityInitial: number;
  capacityTotal: number;
  executed: number;
};

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

function selected(report: ExportReport, personId: string) {
  const people = personId === "all" ? report.people : report.people.filter((person) => person._id === personId);
  const ids = new Set(people.map((person) => person._id));
  const rows = personId === "all" ? report.rows : report.rows.filter((row) => ids.has(row.userId));
  return { people, rows };
}

function fileBase(period: string) {
  return `horitas-${period.replace(/ /g, "-")}`;
}

export async function downloadExcel(report: ExportReport, period: string, personId = "all") {
  const { people, rows } = selected(report, personId);
  const book = new ExcelJS.Workbook();
  book.creator = "Horitas";
  const summary = book.addWorksheet("Resumen");
  summary.addRow(["Horitas"]);
  summary.addRow(["Período", period]);
  summary.addRow(["Capacidad", people.reduce((sum, person) => sum + person.totalHours, 0)]);
  summary.addRow(["Jornada", people.reduce((sum, person) => sum + person.regular, 0)]);
  summary.addRow(["Horas extras", people.reduce((sum, person) => sum + person.extra, 0)]);
  summary.addRow([]);
  summary.addRow(["Persona", "Capacidad", "Jornada", "Extras", "Restan"]);
  for (const person of people) {
    summary.addRow([person.name, person.totalHours, person.regular, person.extra, person.totalHours - person.regular]);
  }
  summary.getColumn(1).width = 32;
  for (let column = 2; column <= 5; column += 1) summary.getColumn(column).width = 16;

  const detail = book.addWorksheet("Ítems");
  const headers = ["Persona", "Ítem", "Asignación", "Ticket", ...report.weeks.map((week, index) => bucketName(week, index)), "Total"];
  detail.addRow(headers);
  for (const row of rows) {
    detail.addRow([
      row.personName,
      row.name,
      TIPO_META[row.tipo].asignacion,
      row.ticket ?? "",
      ...report.weeks.map((_, index) => row.weeks[index] ?? 0),
      row.total,
    ]);
  }
  detail.getColumn(1).width = 28;
  detail.getColumn(2).width = 36;
  detail.columns.forEach((column, index) => {
    if (index > 1) column.width = Math.max(column.width ?? 12, 14);
  });

  const buffer = await book.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(period)}.xlsx`,
  );
}

function barsPng(title: string, rows: { label: string; value: number; color: string }[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 1100;
  canvas.height = 460;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1b2430";
  context.font = "600 28px Georgia, serif";
  context.fillText(title, 36, 48);
  const max = Math.max(1, ...rows.map((row) => row.value));
  const top = 80;
  const height = 280;
  const gap = 18;
  const width = Math.min(86, (canvas.width - 80 - gap * rows.length) / Math.max(rows.length, 1));
  rows.forEach((row, index) => {
    const bar = (row.value / max) * height;
    const x = 40 + index * (width + gap);
    context.fillStyle = row.color;
    context.fillRect(x, top + height - bar, width, bar);
    context.fillStyle = "#1b2430";
    context.font = "600 16px Calibri, sans-serif";
    context.fillText(String(Math.round(row.value * 10) / 10), x, top + height - bar - 8);
    context.save();
    context.translate(x + width / 2, top + height + 18);
    context.rotate(-0.5);
    context.font = "14px Calibri, sans-serif";
    context.fillText(row.label.slice(0, 18), 0, 0);
    context.restore();
  });
  const bytes = atob(canvas.toDataURL("image/png").split(",")[1] ?? "");
  const data = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) data[index] = bytes.charCodeAt(index);
  return data;
}

function wordCell(text: string, bold = false) {
  return new TableCell({
    width: { size: 1600, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
  });
}

export async function downloadWord(report: ExportReport, period: string, personId = "all") {
  const { people, rows } = selected(report, personId);
  const capacity = people.reduce((sum, person) => sum + person.totalHours, 0);
  const regular = people.reduce((sum, person) => sum + person.regular, 0);
  const extra = people.reduce((sum, person) => sum + person.extra, 0);
  const images = [
    barsPng("Capacidad y ejecución", [
      { label: "Inicial", value: report.capacityInitial, color: "#e7c7b0" },
      { label: "Total", value: capacity, color: "#b7c6ea" },
      { label: "Ejecutadas", value: people.reduce((sum, person) => sum + person.executed, 0), color: "#c4622d" },
    ]),
    barsPng(
      "Por persona",
      people.map((person) => ({ label: person.name, value: person.regular + person.extra, color: "#c4622d" })),
    ),
  ].filter((image): image is Uint8Array => image !== null);

  const peopleTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: ["Persona", "Capacidad", "Jornada", "Extras", "Restan"].map((title) => wordCell(title, true)),
      }),
      ...people.map(
        (person) =>
          new TableRow({
            children: [
              person.name,
              String(person.totalHours),
              String(person.regular),
              String(person.extra),
              String(person.totalHours - person.regular),
            ].map((value) => wordCell(value)),
          }),
      ),
    ],
  });
  const itemHeader = ["Persona", "Ítem", "Asignación", ...report.weeks.map((week, index) => bucketName(week, index)), "Total"];
  const itemTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: [
      new TableRow({ children: itemHeader.map((title) => wordCell(title, true)) }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: [
              row.personName,
              row.name,
              TIPO_META[row.tipo].asignacion,
              ...report.weeks.map((_, index) => String(row.weeks[index] ?? 0)),
              String(row.total),
            ].map((value) => wordCell(value)),
          }),
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Horitas", heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: period, italics: true, size: 22 })] }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun(
                `Capacidad ${capacity} h · jornada ${regular} h · extras ${extra} h. Los gráficos corresponden a las horas cargadas en el rango.`,
              ),
            ],
          }),
          ...images.flatMap((data) => [
            new Paragraph({ spacing: { before: 240 }, children: [] }),
            new Paragraph({
              children: [
                new ImageRun({
                  type: "png",
                  data,
                  transformation: { width: 520, height: 218 },
                }),
              ],
            }),
          ]),
          new Paragraph({ text: "Equipo", heading: HeadingLevel.HEADING_1, spacing: { before: 360 } }),
          peopleTable,
          new Paragraph({ text: "Ítems", heading: HeadingLevel.HEADING_1, spacing: { before: 360 } }),
          itemTable,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${fileBase(period)}.docx`);
}
