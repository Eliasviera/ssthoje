"use client";

import RecordStatusForm from "./record-status-form";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createClientAction } from "./client-actions";
import type { ClientCompany } from "@/lib/client-store";
import { CLIENT_THIRD_PARTY_REQUIREMENTS } from "@/lib/third-party-policy";

type UnitDraft = { key: number; cnpj: string; name: string; cityState: string };
type PgrImportPreview = {
  company?: { legalName?: string; tradeName?: string; cnpj?: string; city?: string; state?: string };
  unit?: { name?: string };
  inventory?: { title?: string; revision?: string };
  risks?: Array<{ id: string; activity: string; hazard: string }>;
  notices?: string[];
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits.length === 14 ? digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : value;
}

export default function ClientSection({ companies, canManage }: { companies: ClientCompany[]; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(createClientAction, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PgrImportPreview | null>(null);
  const [importError, setImportError] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [units, setUnits] = useState<UnitDraft[]>([{ key: 1, cnpj: "", name: "", cityState: "" }]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/pgr/import-pdf", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      const extracted = data.extracted as PgrImportPreview;
      setImportResult(extracted);
      if (extracted.company?.legalName) setLegalName(extracted.company.legalName);
      if (extracted.company?.tradeName) setTradeName(extracted.company.tradeName);
      setUnits((current) => current.map((unit, index) => index === 0 ? {
        ...unit,
        cnpj: extracted.company?.cnpj ? formatCnpj(extracted.company.cnpj) : unit.cnpj,
        name: extracted.unit?.name ?? unit.name,
        cityState: extracted.company?.city && extracted.company.state
          ? `${extracted.company.city} - ${extracted.company.state}`
          : unit.cityState,
      } : unit));
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function updateUnit(key: number, field: keyof Omit<UnitDraft, "key">, value: string) {
    setUnits((current) => current.map((unit) => unit.key === key ? { ...unit, [field]: value } : unit));
  }

  return <div className="client-section">
    {canManage ? <section className="panel client-form-panel" aria-labelledby="client-form-title">
      <div className="panel-heading"><div><h2 id="client-form-title">Nova empresa</h2><p>Cadastre uma empresa e uma ou mais unidades.</p></div><span className="period-label">Salvo neste computador</span></div>
      <div className="client-form" style={{ padding: "1rem 1.5rem" }}>
        <label className="form-field form-field-wide">
          <span>Importar PGR em PDF (cria sugestão para empresa + unidade + inventário)</span>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleImport} disabled={importing} />
        </label>
        {importing && <p className="permission-note">Importando e extraindo dados do PDF...</p>}
        {importError && <p className="client-form-message client-form-error">{importError}</p>}
        {importResult && <div className="pgr-card" style={{ marginTop: "0.5rem" }}>
          <header><div><h4>Pré-visualização da importação</h4><p>{importResult.company?.legalName || importResult.company?.tradeName || "Razão social não identificada"} {importResult.company?.cnpj ? `· ${importResult.company.cnpj}` : ""}</p></div></header>
          <p><strong>Unidade identificada:</strong> {importResult.unit?.name || "não identificada"}</p>
          <p><strong>Inventário sugerido:</strong> {importResult.inventory?.title || "PGR Importado"} · {importResult.inventory?.revision || "revisão não identificada"}</p>
          <p><strong>Riscos extraídos:</strong> {importResult.risks?.length || 0}</p>
          {(importResult.risks?.length ?? 0) > 0 && <ul>{importResult.risks!.slice(0, 6).map((risk) => <li key={risk.id}><strong>{risk.activity}:</strong> {risk.hazard}</li>)}</ul>}
          {(importResult.risks?.length || 0) > 6 && <p className="permission-note">... e mais {(importResult.risks?.length || 0) - 6} riscos</p>}
          {importResult.notices?.map((notice) => <p className="document-warning" role="status" key={notice}>{notice}</p>)}
          <p className="permission-note">Razão social, nome fantasia, CNPJ, unidade e cidade/UF identificados foram preenchidos nos campos abaixo. Confira e corrija antes de salvar. Riscos são sugestões extraídas; revise-os antes de criar ou aprovar o PGR.</p>
        </div>}
      </div>
      <form action={formAction} className="client-form">
        <div className="form-field form-field-wide"><label htmlFor="legalName">Razão social</label><input id="legalName" name="legalName" autoComplete="organization" maxLength={160} required value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Ex.: Empresa de demonstração Ltda."/></div>
        <div className="form-field"><label htmlFor="tradeName">Nome fantasia <span>(opcional)</span></label><input id="tradeName" name="tradeName" maxLength={120} value={tradeName} onChange={(event) => setTradeName(event.target.value)} placeholder="Como a empresa é conhecida"/></div>
        <div className="form-field"><label htmlFor="contactName">Pessoa de contato <span>(opcional)</span></label><input id="contactName" name="contactName" autoComplete="name" maxLength={120} placeholder="Nome do contato"/></div>
        <div className="form-field"><label htmlFor="contactEmail">E-mail de contato <span>(opcional)</span></label><input id="contactEmail" name="contactEmail" type="email" autoComplete="email" maxLength={254} placeholder="contato@empresa.com.br"/></div>
        <div className="form-field"><label htmlFor="contactPhone">Telefone de contato <span>(opcional)</span></label><input id="contactPhone" name="contactPhone" type="tel" autoComplete="tel" maxLength={30} placeholder="(00) 00000-0000"/></div>
        <div className="unit-drafts">
          <div className="unit-drafts-heading"><div><h3>Unidades e CNPJs</h3><p>Você pode incluir mais de um CNPJ nesta empresa.</p></div><button className="secondary-button" type="button" onClick={() => setUnits((current) => current.length < 20 ? [...current, { key: Date.now(), cnpj: "", name: "", cityState: "" }] : current)} disabled={units.length >= 20}>+ Adicionar unidade</button></div>
          {units.map((unit, index) => <fieldset className="unit-draft" key={unit.key}><legend>Unidade {index + 1}</legend><div className="unit-fields"><div className="form-field"><label htmlFor={`unit-cnpj-${unit.key}`}>CNPJ</label><input id={`unit-cnpj-${unit.key}`} name="unitCnpj" inputMode="numeric" autoComplete="off" maxLength={18} value={unit.cnpj} onChange={(event) => updateUnit(unit.key, "cnpj", event.target.value)} required placeholder="00.000.000/0000-00"/></div><div className="form-field"><label htmlFor={`unit-name-${unit.key}`}>Nome da unidade <span>(opcional)</span></label><input id={`unit-name-${unit.key}`} name="unitName" maxLength={120} value={unit.name} onChange={(event) => updateUnit(unit.key, "name", event.target.value)} placeholder="Matriz, filial..."/></div><div className="form-field"><label htmlFor={`unit-place-${unit.key}`}>Cidade / UF <span>(opcional)</span></label><input id={`unit-place-${unit.key}`} name="unitCityState" maxLength={120} value={unit.cityState} onChange={(event) => updateUnit(unit.key, "cityState", event.target.value)} placeholder="Cidade - UF"/></div>{units.length > 1 && <button className="remove-unit" type="button" onClick={() => setUnits((current) => current.filter((entry) => entry.key !== unit.key))} aria-label={`Remover unidade ${index + 1}`}>Remover</button>}</div></fieldset>)}
        </div>
        <fieldset className="aso-exams client-thirdparty-policy pgr-wide"><legend>Documentos padrão de empresas contratadas</legend><p className="aso-help">Define um ponto de partida para cada convite; a equipe ajusta conforme atividade, contrato, riscos e unidade.</p><div className="thirdparty-checks">{CLIENT_THIRD_PARTY_REQUIREMENTS.filter((kind) => kind !== "ASO").map((kind) => <label key={kind}><input type="checkbox" name="thirdPartyRequirements" value={kind}/>{kind}</label>)}</div><label className="thirdparty-medical-policy"><input type="checkbox" name="thirdPartyRequirements" value="ASO"/> ASO dos trabalhadores terceiros · avaliação médica restrita, confrontada com atividades e aptidões previstas no PGR/PCMSO do terceiro; sem envio pelo portal público</label></fieldset>
        {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}
        {state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
        <div className="client-form-footer"><p>O cadastro ficará vinculado a <strong>esta consultoria</strong> e será gravado localmente, sem criptografia. Use somente dados fictícios nesta demonstração.</p><button className="primary-button" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar empresa"}</button></div>
      </form>
    </section> : <div className="permission-note"><strong>Consulta de empresas</strong><span>Este perfil pode consultar os cadastros, mas não criar ou arquivar empresas.</span></div>}

    <section className="client-list-section" aria-labelledby="client-list-title"><div className="client-list-heading"><div><h2 id="client-list-title">Clientes da consultoria</h2><p>{companies.length} {companies.length === 1 ? "empresa" : "empresas"} nesta consultoria</p></div></div>
      {companies.length ? <div className="client-list">{companies.map((company) => <article className={`client-card${company.status === "archived" ? " client-card-archived" : ""}`} key={company.id}>
        <div className="client-card-top"><div className="client-avatar" aria-hidden="true">{company.legalName.slice(0, 1).toUpperCase()}</div><div className="client-title"><h3>{company.tradeName || company.legalName}</h3>{company.tradeName && <p>{company.legalName}</p>}</div><span className={`client-status ${company.status === "active" ? "status-active" : "status-archived"}`}>{company.status === "active" ? "Ativa" : "Arquivada"}</span></div>
        <div className="client-units">{company.units.map((unit) => <div className="client-unit" key={unit.id}><span className="unit-marker" aria-hidden="true"/><span><strong>{unit.name}</strong><small>{formatCnpj(unit.cnpj)}{unit.cityState ? ` · ${unit.cityState}` : ""}</small></span></div>)}</div>
        {company.thirdPartyRequirements?.length ? <div className="client-contact"><span>Checklist padrão de contratadas</span><strong>{company.thirdPartyRequirements.filter((kind) => kind !== "ASO").join(" · ") || "Sem documentos para envio público"}</strong>{company.thirdPartyRequirements.includes("ASO") && <small>ASO de trabalhadores terceiros: acompanhamento médico restrito</small>}</div> : <div className="client-contact"><span>Checklist de contratadas</span><strong>Não configurado</strong><small>Novos convites precisarão definir os documentos individualmente.</small></div>}
        {(company.contactName || company.contactEmail || company.contactPhone) && <div className="client-contact"><span>Contato</span><strong>{company.contactName || company.contactEmail || company.contactPhone}</strong><small>{[company.contactEmail, company.contactPhone].filter(Boolean).join(" · ")}</small></div>}
        <div className="client-card-footer"><small>Atualizada em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(company.updatedAt))}</small><div className="client-card-actions"><Link className="text-button" href={`/empresas/${company.id}`}>Abrir ficha</Link><Link className="text-button" href={`/empresas/${company.id}?tab=pgr`}>PGR</Link><Link className="text-button" href={`/empresas/${company.id}?tab=terceiros`}>Terceiros do cliente</Link><Link className="text-button" href="/configuracoes/terceiros">Política de rigor</Link>{canManage && <RecordStatusForm resource="company" id={company.id} active={company.status === "active"}/>}</div></div>
      </article>)}</div> : <div className="client-empty"><span className="client-empty-icon" aria-hidden="true">▦</span><h3>Nenhuma empresa cadastrada ainda</h3><p>Quando você salvar a primeira empresa, ela aparecerá aqui com suas unidades e CNPJs.</p></div>}
    </section>
  </div>;
}
