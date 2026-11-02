// Prévia visual isolada do componente real; não lê nem grava dados operacionais.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
async function loadComponent(file) {
  const source = readFileSync(resolve(file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    .replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href))
    .replaceAll('"@/lib/apr-revision-comparison"', JSON.stringify(pathToFileURL(resolve("src/lib/apr-revision-comparison.ts")).href));
  return (await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"))).default;
}
const History = await loadComponent("src/app/apr-revision-history.tsx");
const Origin = await loadComponent("src/app/apr-checklist-origin.tsx");
const answer = { id: "question-demo", prompt: "Pergunta organizacional fictícia", result: "unanswered", notes: "", nextStep: "", responsible: "" };
const history = [
  { revision: 1, status: "draft", action: "created", occurredAt: "2026-10-25T12:00:00.000Z", actorUserId: "conta-ficticia-autora", answers: [answer] },
  { revision: 2, status: "draft", action: "saved", occurredAt: "2026-10-25T12:15:00.000Z", actorUserId: "conta-ficticia-editora", answers: [{ ...answer, result: "attention", notes: "Observação sintética para conferir o histórico.", nextStep: "Ação fictícia definida pela equipe.", responsible: "Pessoa fictícia" }] },
  { revision: 3, status: "in_review", action: "submitted", occurredAt: "2026-10-25T12:20:00.000Z", actorUserId: "conta-ficticia-editora", answers: [{ ...answer, result: "not_applicable", notes: "Justificativa sintética da revisão atual." }] },
];
const scenarios = [
  ["APR fictícia · histórico completo", history],
  ["APR fictícia · histórico parcial", [{ ...history[1], revision: 7, action: "legacy_snapshot", actorUserId: undefined }]],
  ["APR fictícia · sem histórico registrado", undefined],
];
const origin = { tenantId: "tenant-ficticio", checklistTemplateId: "modelo-ficticio", checklistTemplateVersion: 1, checklistTitle: "Modelo fictício de organização", checklistSnapshot: {
  id: "modelo-ficticio", tenantId: "tenant-ficticio", version: 1, title: "Modelo fictício de organização", activity: "Atividade sintética", activityKind: "general_activity", reviewedAt: "2026-10-25T11:00:00Z", reviewedBy: "conta-ficticia-revisora",
  reference: { title: "Fonte sintética para teste visual", version: "Edição fictícia 1", jurisdiction: "Âmbito sintético", validFrom: "2026-01-01", validUntil: "", reviewer: "Pessoa fictícia revisora" },
} };
const content = scenarios.map(([title, entries], index) => `<article><h2>${title}</h2>${renderToStaticMarkup(createElement(Origin, { origin: index === 0 ? origin : { ...origin, checklistSnapshot: undefined } }))}${renderToStaticMarkup(createElement(History, { history: entries }))}</article>`).join("")
  + `<article><h2>APR fictícia · origem inconsistente</h2>${renderToStaticMarkup(createElement(Origin, { origin: { ...origin, checklistSnapshot: { ...origin.checklistSnapshot, tenantId: "outro-tenant", reference: { ...origin.checklistSnapshot.reference, title: "FONTE-FICTICIA-FORA-DO-ESCOPO" } } } }))}</article>`;
if (content.includes("FONTE-FICTICIA-FORA-DO-ESCOPO")) throw new Error("Prévia revelou detalhes da origem divergente.");
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia do histórico APR</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#f5f8f5;color:#234137;margin:0}main{max-width:900px;padding:24px;margin:auto}h1{font-size:27px}h2{font-size:21px}article{background:#fff;border:1px solid #dce5df;border-radius:14px;padding:24px;margin:20px 0}details{border-top:1px solid #dce5df;padding:16px 0}summary{cursor:pointer;font-weight:650}p,li{overflow-wrap:anywhere}li{margin-bottom:16px}.permission-note{background:#eef5ef;padding:14px;border-radius:8px}:focus-visible{outline:3px solid #be8400;outline-offset:3px}</style></head><body><main><h1>Histórico de revisões da APR</h1><p>PRÉVIA ISOLADA · dados inteiramente fictícios · sem gravação operacional.</p>${content}</main></body></html>`;
const output = resolve("../../docs/APR_HISTORY_PREVIEW.html");
writeFileSync(output, html, "utf8");
console.log(output);
