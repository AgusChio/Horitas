import type { RangeGroup } from "../../convex/dates";
import { Button, DateInput, Select } from "./ui";

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
        <DateInput className="mt-1 rounded-full" value={start} onChange={onStart} />
      </label>
      <label className="text-sm font-semibold">
        Hasta
        <DateInput className="mt-1 rounded-full" value={end} onChange={onEnd} />
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
