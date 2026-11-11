"use client";

import { useMemo, useState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { EquipmentRecord } from "@/lib/equipment-inventory-store";
import type { ChecklistTemplate, ChecklistInspection } from "@/lib/checklist-store";

// Inventário de equipamentos + indicativo de inspeções (atrasadas / não realizadas).
// A base: o equipamento existe no inventário e as inspeções o referenciam,
// permitindo saber quem NÃO foi inspecionado no período.

const FREQUENCY_LABEL: Record<string, string> = {
  antes_uso: "Antes do uso", diario: "Diária", semanal: "Semanal", mensal: "Mensal",
};

const SITUATION_LABEL: Record<EquipmentRecord["situation"], string> = {
  ativo: "Ativo",
  manutencao: "Em manutenção",
  baixado: "Baixado",
};

function daysSince(date: string): number {
  const then = new Date(`${date}T00:00:00Z`).getTime();
  return Math.floor((Date.now() - then) / 86400000);
}

export default function EquipmentPanel({
  equipment, companies, templates, inspections, canManage,
}: {
  equipment: EquipmentRecord[];
  companies: ClientCompany[];
  templates: ChecklistTemplate[];
  inspections: ChecklistInspection[];
  canManage: boolean;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [brandModel, setBrandModel] = useState("");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [frequency, setFrequency] = useState<EquipmentRecord["requiredFrequency"]>("diario");
  const [created, setCreated] = useState("");
  const [error, setError] = useState("");

  const byEquipment: Map<string, ChecklistInspection[]> = useMemo(() => {
    const map = new Map<string, ChecklistInspection[]>();
    for (const inspection of inspections) {
      if (!inspection.equipmentId) continue;
      const list = map.get(inspection.equipmentId) ?? [];
      list.push(inspection);
      map.set(inspection.equipmentId, list);
    }
    return map;
  }, [inspections]);

  function register(event: React.FormEvent) {
    event.preventDefault();
    // action local via fetch para a server action de criar equipamento
    void (async () => {
      const formData = new FormData();
      formData.set("code", code); formData.set("name", name); formData.set("brandModel", brandModel);
      formData.set("sector", sector); formData.set("location", location);
      formData.set("templateId", templateId); formData.set("frequency", frequency ?? "");
      const response = await fetch("/api/equipamentos", { method: "POST", body: formData });
      const result = await response.json();
      if (result.error) { setError(result.error); return; }
      setCreated(result.equipment ? `${result.equipment.code} cadastrado` : "Cadastrado");
      setError(""); setCode(""); setName(""); setBrandModel(""); setSector(""); setLocation("");
      setTimeout(() => setCreated(""), 3000);
      window.location.reload();
    })();
  }

  const ativos = equipment.filter((entry) => entry.situation !== "baixado");
  const comInspecao = new Set(inspections.map((inspection) => inspection.equipmentId).filter(Boolean));
  const semInspecao = ativos.filter((entry) => !comInspecao.has(entry.id));

  return <section className="panel pgr-section" aria-label="Inventário de equipamentos">
    {canManage && <details className="aso-new"><summary>Cadastrar equipamento</summary>
      <form onSubmit={register} className="pgr-form">
        <div className="client-section-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: ".75rem" }}>
          <label className="form-field">Código/patrimônio<input required value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} placeholder="P-02"/></label>
          <label className="form-field">Nome<input required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Prensa hidráulica 60t"/></label>
          <label className="form-field">Marca/modelo<input value={brandModel} onChange={(e) => setBrandModel(e.target.value)} maxLength={120}/></label>
          <label className="form-field">Setor<input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={80}/></label>
          <label className="form-field">Localização<input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120}/></label>
          <label className="form-field">Modelo de checklist<select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">— Selecione —</option>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select></label>
          <label className="form-field">Frequência exigida<select value={frequency ?? ""} onChange={(e) => setFrequency(e.target.value as EquipmentRecord["requiredFrequency"])}>
            <option value="antes_uso">Antes do uso</option><option value="diario">Diária</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option>
          </select></label>
        </div>
        <button type="submit" className="primary-button">Cadastrar equipamento</button>
        {error && <p role="alert" className="client-form-message client-form-error">{error}</p>}
        {created && <p role="status" className="client-form-message client-form-success">{created}</p>}
      </form>
    </details>}

    <div className="cipa-totals" role="list" aria-label="Resumo de equipamentos">
      <div className="cipa-total" role="listitem"><strong>{ativos.length}</strong><span>Equipamentos ativos</span></div>
      <div className="cipa-total" role="listitem"><strong>{semInspecao.length}</strong><span>Sem inspeção registrada</span></div>
      <div className="cipa-total" role="listitem"><strong>{inspections.length}</strong><span>Inspeções registradas</span></div>
    </div>

    <h2>Equipamentos e inspeções</h2>
    {ativos.length === 0 && <p className="permission-note">Nenhum equipamento cadastrado. Cadastre o primeiro acima.</p>}
    <div className="cipa-terms">
      {ativos.map((equipment) => {
        const equipmentInspections = (byEquipment.get(equipment.id) ?? []).sort((a, b) => b.performedOn.localeCompare(a.performedOn));
        const last = equipmentInspections[0];
        const days = last ? daysSince(last.performedOn) : null;
        const overdue = equipment.requiredFrequency === "diario" && (days === null || days >= 1)
          || equipment.requiredFrequency === "semanal" && (days === null || days >= 7)
          || equipment.requiredFrequency === "mensal" && (days === null || days >= 30)
          || equipment.requiredFrequency === "antes_uso" && days === null;
        return <article key={equipment.id} className="pgr-card">
          <header style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
            <div><h3>{equipment.code} · {equipment.name}</h3>
              <p>{equipment.brandModel || "—"} {equipment.sector ? `· ${equipment.sector}` : ""} {equipment.location ? `· ${equipment.location}` : ""} · {SITUATION_LABEL[equipment.situation]}</p>
              {equipment.requiredFrequency && <p style={{ fontSize: ".78rem", opacity: .8 }}>Frequência exigida: {FREQUENCY_LABEL[equipment.requiredFrequency] ?? equipment.requiredFrequency}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              {overdue ? <span className="client-status status-archived" style={{ background: "#fbe9e7", color: "#a93226" }}>INSPEÇÃO PENDENTE</span>
                : last ? <span className="client-status status-active">Em dia</span> : <span className="client-status status-archived">Sem inspeção</span>}
              {last && <p style={{ fontSize: ".8rem", marginTop: ".35rem" }}>Última: {last.performedOn.split("-").reverse().join("/")} · {days} dia(s)</p>}
            </div>
          </header>
          {equipmentInspections.length > 0 && <details><summary>Ver inspeções ({equipmentInspections.length})</summary>
            <ul>{equipmentInspections.map((inspection) => <li key={inspection.id}>{inspection.performedOn.split("-").reverse().join("/")} · {inspection.results.filter((r) => r.answer === "nok").length} não conforme(s) · {inspection.inspector}</li>)}</ul>
          </details>}
        </article>;
      })}
    </div>
  </section>;
}
