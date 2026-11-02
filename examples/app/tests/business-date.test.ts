import test from "node:test";
import assert from "node:assert/strict";
import { saoPauloDate } from "../src/lib/business-date.ts";

test("vigência usa o dia de São Paulo antes e depois da meia-noite local", () => {
  assert.equal(saoPauloDate(new Date("2026-10-12T02:59:59.999Z")), "2026-10-11");
  assert.equal(saoPauloDate(new Date("2026-10-12T03:00:00.000Z")), "2026-10-12");
});

test("dia local preserva virada de ano e data bissexta", () => {
  assert.equal(saoPauloDate(new Date("2027-01-01T00:30:00Z")), "2026-12-31");
  assert.equal(saoPauloDate(new Date("2024-03-01T02:30:00Z")), "2024-02-29");
});
