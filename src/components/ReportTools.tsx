import type { RangeGroup } from "../../convex/dates";
import { Button, Select } from "./ui";

export function ReportTools({
  start,
  end,
  group,
  canDownload,
  busy,
  onStart,
  onEnd,
  onGroup,
  onExcel,
  onWord,
}: {
  start: string;
  end: string;
  group: RangeGroup;
  canDownload: boolean;
  busy: boolean;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onGroup: (value: RangeGroup) => void;
  onExcel: () => void;
  onWord: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm font-semibold">
        Ver por
        <Select
          className="mt-1 min-w-40"
          label="Ver por"
          value={group}
          onChange={(value) => onGroup(value as RangeGroup)}
          options={[
            { value: "semana", label: "Semanas" },
            { value: "mes", label: "Meses" },
            { value: "dia", label: "Días" },
          ]}
        />
      </label>
      <label className="text-sm font-semibold">
        Desde
        <input
          type="date"
          value={start}
          onChange={(event) => onStart(event.target.value)}
          className="mt-1 block rounded-full border border-line bg-card px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm font-semibold">
        Hasta
        <input
          type="date"
          value={end}
          onChange={(event) => onEnd(event.target.value)}
          className="mt-1 block rounded-full border border-line bg-card px-3 py-2 text-sm"
        />
      </label>
      <Button type="button" variant="ghost" disabled={!canDownload || busy} onClick={onExcel} title={canDownload ? "Descargar Excel" : "Se habilita cuando hay horas cargadas"}>
        Excel
      </Button>
      <Button type="button" variant="ghost" disabled={!canDownload || busy} onClick={onWord} title={canDownload ? "Descargar Word" : "Se habilita cuando hay horas cargadas"}>
        Word
      </Button>
    </div>
  );
}
