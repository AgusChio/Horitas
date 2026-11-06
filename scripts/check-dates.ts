import { countBusinessDays, weekNumber } from "../convex/dates.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const julyAr = countBusinessDays(2026, 7, ["2026-07-09", "2026-07-10"]);
const julyCo = countBusinessDays(2026, 7, ["2026-07-13", "2026-07-20"]);
const novemberAr = countBusinessDays(2026, 11, ["2026-11-23"]);
const novemberCo = countBusinessDays(2026, 11, ["2026-11-02", "2026-11-16"]);

assert(julyAr === 21, `Julio AR esperaba 21 y dio ${julyAr}`);
assert(julyCo === 21, `Julio CO esperaba 21 y dio ${julyCo}`);
assert(novemberAr === 20, `Noviembre AR esperaba 20 y dio ${novemberAr}`);
assert(novemberCo === 19, `Noviembre CO esperaba 19 y dio ${novemberCo}`);
assert(weekNumber(2026, 7, 1) === 1, "El 1 de julio tiene que ser S1");
assert(weekNumber(2026, 7, 5) === 1, "El 5 de julio tiene que ser S1");
assert(weekNumber(2026, 7, 6) === 2, "El 6 de julio tiene que ser S2");
assert(weekNumber(2026, 7, 31) === 5, "El 31 de julio tiene que ser S5");
