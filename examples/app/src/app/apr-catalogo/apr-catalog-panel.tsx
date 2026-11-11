"use client";

import { useState } from "react";
import type { AprCatalogModel, Applicability } from "@/lib/apr-catalog";

type Summary = { stages: number; hazards: number; applicable: number; notApplicable: number; toConfirm: number };

const APPLICABILITY_LABEL: Record<Applicability, string> = {
  aplicavel: "Aplicável",
  nao_aplicavel: "Não aplicável",
  a_confirmar: "A confirmar",
};

const APPLICABILITY_COLOR: Record<Applicability, string> = {
  aplicavel: "#1e7a4c",
  nao_aplicavel: "#a93226",
  a_confirmar: "#9c640c",
};

export default function AprCatalogPanel({ models, canManage }: { models: { model: AprCatalogModel; summary: Summary }[]; canManage: boolean }) {
  return <section className="panel pgr-section" aria-label="Acervo de APR">
    {models.length === 0 && <p className="permission-note">Nenhum modelo no acervo.</p>}
    {models.map(({ model, summary }) => <ModelCard key={model.id} model={model} summary={summary} canManage={canManage}/>)}
  </section>;
}

function ModelCard({ model, summary, canManage }: { model: AprCatalogModel; summary: Summary; canManage: boolean }) {
  const [openStages, setOpenStages] = useState<string[]>([]);
  function toggle(stageId: string) {
    setOpenStages((prev) => prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]);
  }
  return <article className="pgr-card">
    <header style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
      <div>
        <h3>{model.title}</h3>
        <p>{model.activityGroup} · {model.nr}</p>
        <p style={{ fontSize: ".85rem", opacity: .85 }}>{model.summary}</p>
      </div>
      <div style={{ textAlign: "right" }}>
        <span className={`client-status ${model.status === "active" ? "status-active" : "status-archived"}`}>{model.status === "active" ? "Ativo" : model.status === "draft" ? "Rascunho · conferência pendente" : "Substituído"}</span>
      </div>
    </header>

    <div className="cipa-totals" role="list" aria-label="Resumo do modelo">
      <div className="cipa-total" role="listitem"><strong>{summary.stages}</strong><span>Etapas</span></div>
      <div className="cipa-total" role="listitem"><strong>{summary.hazards}</strong><span>Perigos</span></div>
      <div className="cipa-total" role="listitem"><strong>{summary.applicable}</strong><span>Aplicáveis</span></div>
      <div className="cipa-total" role="listitem"><strong>{summary.notApplicable}</strong><span>Não aplicáveis</span></div>
      <div className="cipa-total" role="listitem"><strong>{summary.toConfirm}</strong><span>A confirmar</span></div>
    </div>

    <h4>Etapas operacionais</h4>
    {model.stages.map((stage) => <div key={stage.id} style={{ border: "1px solid #d8e3df", borderRadius: ".5rem", marginBottom: ".5rem" }}>
      <button type="button" className="text-action" onClick={() => toggle(stage.id)} style={{ width: "100%", textAlign: "left", padding: ".5rem .7rem" }}>
        <strong>{stage.order}. {stage.name}</strong> · {stage.hazards.length} perigo(s) {openStages.includes(stage.id) ? "▾" : "▸"}
      </button>
      {openStages.includes(stage.id) && <div style={{ padding: "0 .7rem .7rem" }}>
        <p style={{ fontSize: ".85rem", opacity: .85 }}>{stage.objective}</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
          <thead><tr><th style={{ textAlign: "left", padding: ".3rem" }}>Perigo</th><th style={{ textAlign: "left", padding: ".3rem" }}>Risco</th><th style={{ textAlign: "left", padding: ".3rem" }}>Medidas de controle</th><th style={{ textAlign: "left", padding: ".3rem" }}>EPI</th><th style={{ textAlign: "left", padding: ".3rem" }}>Aplicabilidade</th></tr></thead>
          <tbody>
            {stage.hazards.map((hazard) => <tr key={hazard.id} style={{ borderTop: "1px solid #eef3f1" }}>
              <td style={{ padding: ".35rem", verticalAlign: "top" }}>{hazard.hazard}</td>
              <td style={{ padding: ".35rem", verticalAlign: "top" }}>{hazard.risk}</td>
              <td style={{ padding: ".35rem", verticalAlign: "top" }}><ul style={{ margin: 0, paddingLeft: "1rem" }}>{hazard.controls.map((control) => <li key={control}>{control}</li>)}</ul></td>
              <td style={{ padding: ".35rem", verticalAlign: "top" }}>{hazard.ppe.join(", ")}</td>
              <td style={{ padding: ".35rem", verticalAlign: "top", whiteSpace: "nowrap" }}>
                <span style={{ color: APPLICABILITY_COLOR[hazard.defaultApplicability], fontWeight: 700, fontSize: ".8rem" }}>{APPLICABILITY_LABEL[hazard.defaultApplicability]}</span>
                <br/><small style={{ opacity: .7 }}>{hazard.reference}</small>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </div>)}

    {canManage && model.status === "draft" && <p className="permission-note">Modelo em rascunho: a ativação exige conferência do responsável técnico.</p>}
  </article>;
}
