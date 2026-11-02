import assert from "node:assert/strict";
import test from "node:test";
import { createCorrectionPeriod, correctionPeriodLabel } from "../src/lib/correction-period.ts";

test("prazo usa a data de Brasília, três dias corridos e virada de ano", () => {
  assert.deepEqual(createCorrectionPeriod(new Date("2027-01-01T01:00:00Z")), { startedOn: "2026-12-31", dueOn: "2027-01-03", calendarDays: 3, timeZone: "America/Sao_Paulo" });
  assert.equal(createCorrectionPeriod(new Date("2028-02-27T15:00:00Z")).dueOn, "2028-03-01");
  assert.equal(createCorrectionPeriod(new Date("2026-10-16T15:00:00Z")).dueOn, "2026-10-19");
});

test("pendência legada não recebe prazo presumido", () => {
  assert.match(correctionPeriodLabel(), /não registrado/);
  assert.match(correctionPeriodLabel(createCorrectionPeriod(new Date("2026-10-14T15:00:00Z"))), /14\/10\/2026 até 17\/10\/2026/);
});
