import assert from "node:assert/strict";
import test from "node:test";
import { findPcmsoEsocialSource, pcmsoEsocialReference, type PcmsoEsocialSource } from "../src/lib/pcmso-esocial-reference.ts";

const source: PcmsoEsocialSource = {
  id: "pcmso-demo-1",
  version: 3,
  companyId: "company-demo",
  unitId: "unit-demo",
  companyName: "Empresa Fictícia",
  unitName: "Unidade de Demonstração",
};

test("cria referência de fonte PCMSO com versão salva", () => {
  assert.equal(pcmsoEsocialReference(source), "pcmso:pcmso-demo-1:v3");
  assert.equal(pcmsoEsocialReference({ id: source.id, version: 0 }), "");
});

test("resolve qualquer versão salva sem permitir troca de escopo", () => {
  const history = [{ ...source, version: 1 }, { ...source, version: 2 }, source];
  assert.equal(findPcmsoEsocialSource(history, "pcmso:pcmso-demo-1:v1"), history[0]);
  assert.equal(findPcmsoEsocialSource(history, "pcmso:pcmso-demo-1:v2"), history[1]);
  assert.equal(findPcmsoEsocialSource(history, "pcmso:pcmso-demo-1:v4"), undefined);
  assert.equal(findPcmsoEsocialSource(history, "pcmso:other-tenant:v3"), undefined);
  assert.equal(findPcmsoEsocialSource(history, "pcmso:pcmso-demo-1:v3", { companyId: "company-demo", unitId: "unit-demo" }), source);
  assert.equal(findPcmsoEsocialSource(history, "pcmso:pcmso-demo-1:v3", { companyId: "company-other", unitId: "unit-demo" }), undefined);
});
