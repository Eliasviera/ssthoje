"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ClientCompany } from "@/lib/client-store";
import {
  ESOCIAL_CATALOG_SNAPSHOT,
  getEsocialCode,
  searchEsocialCodes,
  type EsocialTableId,
} from "@/lib/esocial-catalog";
import type { EsocialMapping } from "@/lib/esocial-mapping-store";
import {
  reviewEsocialMappingAction,
  saveEsocialMappingAction,
  type EsocialMappingFormState,
} from "./actions";
import {
  findPcmsoEsocialSource,
  pcmsoEsocialReference,
  type PcmsoEsocialSource,
} from "@/lib/pcmso-esocial-reference";

function Feedback({ state }: { state: EsocialMappingFormState }) {
  return <>{state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}</>;
}

function CodePicker({ tableId, initialCode = "" }: { tableId: EsocialTableId; initialCode?: string }) {
  const [query, setQuery] = useState(initialCode);
  const [selectedCode, setSelectedCode] = useState(initialCode);
  const matches = searchEsocialCodes(tableId, query).slice(0, 15);
  const selected = selectedCode ? getEsocialCode(tableId, selectedCode) : undefined;

  return <div className="esocial-code-picker">
    <label>Código ou descrição oficial
      <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedCode(""); }} placeholder="Pesquise pela descrição ou pelo código" autoComplete="off"/>
    </label>
    <input type="hidden" name="code" value={selectedCode} required/>
    <p role="status">{selected ? `Selecionado: ${selected.code} · ${selected.label}` : "Escolha um resultado oficial para continuar."}</p>
    {query && !selected && <ul aria-label="Resultados do catálogo">{matches.map((entry) => <li key={entry.code}><button type="button" onClick={() => { setSelectedCode(entry.code); setQuery(`${entry.code} · ${entry.label}`); }}>{entry.code} · {entry.label}</button></li>)}</ul>}
    {query && !matches.length && <p>Nenhum resultado neste snapshot.</p>}
  </div>;
}

function MappingForm({
  tableId,
  companies,
  pcmsoSources,
  initial,
  mappingId,
  expectedRevision,
  supersedesMappingId,
  supersedesRevision,
}: {
  tableId: EsocialTableId;
  companies: ClientCompany[];
  pcmsoSources: PcmsoEsocialSource[];
  initial?: Pick<EsocialMapping, "companyId" | "unitId" | "code" | "sourceReference" | "targetDescription" | "rationale">;
  mappingId?: string;
  expectedRevision?: number;
  supersedesMappingId?: string;
  supersedesRevision?: number;
}) {
  const [state, action, pending] = useActionState(saveEsocialMappingAction, {});
  const [scope, setScope] = useState(initial ? `${initial.companyId}|${initial.unitId}` : "");
  const [sourceReference, setSourceReference] = useState(() => initial?.sourceReference ?? "");
  const [companyId, unitId] = scope.split("|");
  const fixedScope = Boolean(mappingId || supersedesMappingId);
  const matchingPcmsoSources = pcmsoSources.filter((source) => source.companyId === companyId && source.unitId === unitId);
  const selectedPcmsoSource = findPcmsoEsocialSource(matchingPcmsoSources, sourceReference);
  const sourcePrompt = tableId === "24" ? "Referência exata ao risco no PGR (ID/versão/trecho)" : "Referência exata ao plano PCMSO (ID/versão/trecho)";
  const targetPrompt = tableId === "24" ? "Agente identificado no PGR e grupo relacionado" : "Procedimento clínico/complementar que foi definido pelo médico";
  const rationalePrompt = tableId === "24" ? "Fundamentação manual da associação ao código da Tabela 24" : "Indicação e justificativa médica para associar ao código da Tabela 27";

  return <form action={action} className="pgr-form esocial-mapping-form">
    <input type="hidden" name="tableId" value={tableId}/>
    {mappingId && <><input type="hidden" name="mappingId" value={mappingId}/><input type="hidden" name="expectedRevision" value={expectedRevision}/></>}
    {supersedesMappingId && <><input type="hidden" name="supersedesMappingId" value={supersedesMappingId}/><input type="hidden" name="supersedesRevision" value={supersedesRevision}/></>}
    {fixedScope ? <input type="hidden" name="companyId" value={companyId ?? initial?.companyId ?? ""}/> : <label className="form-field pgr-wide">Empresa e unidade<select required value={scope} onChange={(event) => { setScope(event.target.value); setSourceReference(""); }}><option value="" disabled>Selecione</option>{companies.filter((company) => company.status === "active").flatMap((company) => company.units.map((unit) => <option key={`${company.id}|${unit.id}`} value={`${company.id}|${unit.id}`}>{company.tradeName || company.legalName} · {unit.name}</option>))}</select></label>}
    {!fixedScope && <><input type="hidden" name="companyId" value={companyId ?? ""}/><input type="hidden" name="unitId" value={unitId ?? ""}/></>}
    {fixedScope && <input type="hidden" name="unitId" value={unitId ?? initial?.unitId ?? ""}/>}
    <p className="permission-note esocial-mapping-source">Snapshot usado: {ESOCIAL_CATALOG_SNAPSHOT.sourceVersion}. A escolha do código é manual; o sistema não deduz correspondência.</p>
    <CodePicker key={`${tableId}-${initial?.code ?? "new"}`} tableId={tableId} initialCode={initial?.code}/>
    {tableId === "27" ? <>
      <label className="form-field pgr-wide">PCMSO atribuído e versão salva<select required value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} disabled={!matchingPcmsoSources.length}><option value="" disabled>{matchingPcmsoSources.length ? "Selecione o PCMSO" : "Nenhum PCMSO salvo neste escopo"}</option>{matchingPcmsoSources.map((source) => <option key={source.id} value={pcmsoEsocialReference(source)}>PCMSO · versão {source.version} · {source.companyName} · {source.unitName}</option>)}</select></label>
      <input type="hidden" name="sourceReference" value={sourceReference}/>
      {!matchingPcmsoSources.length && <p className="permission-note pgr-wide">Vincule um PCMSO a você e salve uma versão neste escopo antes de associar um procedimento. A seleção não significa que o procedimento foi indicado ou realizado.</p>}
    </> : <label className="form-field pgr-wide">{sourcePrompt}<input name="sourceReference" required maxLength={300} defaultValue={initial?.sourceReference ?? ""} placeholder="Ex.: PGR ID..., revisão 3, risco ..."/></label>}
    <label className="form-field pgr-wide">{targetPrompt}<textarea name="targetDescription" required maxLength={1000} rows={3} defaultValue={initial?.targetDescription ?? ""}/></label>
    <label className="form-field pgr-wide">{rationalePrompt}<textarea name="rationale" required maxLength={2000} rows={4} defaultValue={initial?.rationale ?? ""}/></label>
    <Feedback state={state}/>
    <button className="secondary-button" disabled={pending || (tableId === "27" && !selectedPcmsoSource)}>{pending ? "Salvando…" : mappingId ? "Salvar nova revisão do rascunho" : supersedesMappingId ? "Criar nova versão como rascunho" : "Criar associação como rascunho"}</button>
  </form>;
}

function MappingCard({ mapping, companies, pcmsoSources }: { mapping: EsocialMapping; companies: ClientCompany[]; pcmsoSources: PcmsoEsocialSource[] }) {
  const [reviewState, reviewAction, reviewPending] = useActionState(reviewEsocialMappingAction, {});
  const company = companies.find((entry) => entry.id === mapping.companyId);
  const unit = company?.units.find((entry) => entry.id === mapping.unitId);
  const pcmsoSource = mapping.tableId === "27" ? findPcmsoEsocialSource(pcmsoSources, mapping.sourceReference) : undefined;
  return <article className="pgr-card esocial-mapping-card">
    <header><div><h3>Tabela {mapping.tableId} · {mapping.code}</h3><p>{company?.tradeName || company?.legalName || "Empresa arquivada"} · {unit?.name ?? "Unidade"}</p></div><span className="period-label">{mapping.status === "reviewed" ? `Revisão humana registrada · v${mapping.revision}` : `Rascunho · v${mapping.revision}`}</span></header>
    <p><strong>Código no snapshot:</strong> {mapping.codeLabel}</p>
    <p><strong>Origem interna:</strong> {pcmsoSource ? `PCMSO · versão ${pcmsoSource.version} · ${pcmsoSource.companyName} · ${pcmsoSource.unitName}` : mapping.sourceReference}</p>
    <p><strong>Item relacionado:</strong> {mapping.targetDescription}</p>
    <p><strong>Fundamentação registrada:</strong></p><p className="esocial-preserve">{mapping.rationale}</p>
    <p><strong>Catálogo:</strong> {mapping.catalogVersion}</p>
    {mapping.reviewNote && <p><strong>Nota da revisão:</strong> {mapping.reviewNote}</p>}
    {mapping.supersedesMappingId && <p className="permission-note">Esta versão substitui a revisão {mapping.supersedesRevision} da associação {mapping.supersedesMappingId}.</p>}
    <details className="risk-analysis-history"><summary>Histórico desta associação · {mapping.history.length} revisões</summary><ol>{mapping.history.map((entry, index) => <li key={`${entry.revision}-${entry.action}-${index}`}>Versão {entry.revision} · {entry.action === "created" ? "rascunho criado" : entry.action === "saved" ? "rascunho atualizado" : "revisão humana registrada"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurredAt))}{entry.reviewNote && <p>{entry.reviewNote}</p>}</li>)}</ol></details>
    {mapping.status === "draft" ? <>
      <details className="aso-new"><summary>Editar rascunho</summary><MappingForm tableId={mapping.tableId} companies={companies} pcmsoSources={pcmsoSources} initial={mapping} mappingId={mapping.id} expectedRevision={mapping.revision}/></details>
      <form action={reviewAction} className="pgr-form esocial-review-form">
        <input type="hidden" name="tableId" value={mapping.tableId}/><input type="hidden" name="mappingId" value={mapping.id}/><input type="hidden" name="expectedRevision" value={mapping.revision}/>
        <label className="form-field pgr-wide">Justificativa da revisão humana<textarea name="reviewNote" required maxLength={1000} rows={3} placeholder="Registre a conferência da fonte interna e do código oficial."/></label>
        <label className="operations-check"><input type="checkbox" name="confirmReview" value="yes" required/><span>Conferi a referência interna e o código no snapshot oficial; a associação continua sujeita à aplicação e vigência no caso concreto.</span></label>
        <Feedback state={reviewState}/>
        <button className="primary-button" disabled={reviewPending}>{reviewPending ? "Registrando revisão…" : "Registrar revisão humana"}</button>
      </form>
    </> : <details className="aso-new"><summary>Criar versão revisada</summary><p className="permission-note">A revisão registrada é preservada. A nova versão será criada como rascunho, sem alterar a anterior.</p><MappingForm tableId={mapping.tableId} companies={companies} pcmsoSources={pcmsoSources} initial={mapping} supersedesMappingId={mapping.id} supersedesRevision={mapping.revision}/></details>}
  </article>;
}

export default function EsocialMappingPanel({
  mappings,
  companies,
  pcmsoSources,
  canManageTable24,
  canManageTable27,
}: {
  mappings: EsocialMapping[];
  companies: ClientCompany[];
  pcmsoSources: PcmsoEsocialSource[];
  canManageTable24: boolean;
  canManageTable27: boolean;
}) {
  const tableTypes = [
    { id: "24" as const, title: "Tabela 24 · S-2240", description: "Agentes nocivos/atividades a relacionar manualmente com referência interna do PGR.", canManage: canManageTable24 },
    { id: "27" as const, title: "Tabela 27 · S-2220", description: "Procedimentos diagnósticos definidos pelo médico, com referência interna ao PCMSO.", canManage: canManageTable27 },
  ];
  return <main className="platform-shell esocial-mapping-shell">
    <header className="platform-top"><Link href="/referencias">← Consulta de referências eSocial</Link></header>
    <section className="platform-intro"><p>VÍNCULOS MANUAIS · REVISÃO HUMANA</p><h1>Associações eSocial.</h1><p>Registre a relação proposta entre um código oficial e uma referência interna da empresa/unidade.</p></section>
    <p className="platform-warning"><strong>Não é validação nem transmissão.</strong> Esta etapa não determina aplicabilidade, não confere vigência individual nem substitui revisão técnica. A permissão do sistema identifica apenas o papel da conta; não comprova habilitação ou registro profissional. Não registre dados pessoais de trabalhadores ou resultados clínicos.</p>
    <section className="platform-card"><h2>Como usar</h2><p>As associações ficam em rascunho até uma pessoa autorizada registrar a revisão humana. Uma revisão registrada não pode ser editada; alterações criam nova versão vinculada à anterior. Informe a referência interna exata e a fundamentação da associação. O sistema não sugere nem escolhe códigos.</p><p>As Tabelas 24/S-2240 e 27/S-2220 são mantidas separadas e usam o snapshot {ESOCIAL_CATALOG_SNAPSHOT.sourceVersion}.</p></section>
    {tableTypes.filter((table) => table.canManage).map((table) => <section className="platform-card esocial-mapping-workspace" key={table.id}>
      <h2>{table.title}</h2><p>{table.description}</p>
      <details className="aso-new"><summary>Nova associação em rascunho</summary>{companies.some((company) => company.status === "active" && company.units.length > 0) ? <MappingForm tableId={table.id} companies={companies} pcmsoSources={pcmsoSources}/> : <p className="permission-note">Cadastre empresa e unidade ativas antes de criar a associação.</p>}</details>
      <div className="esocial-mapping-list"><h3>Associações registradas · {mappings.filter((mapping) => mapping.tableId === table.id).length}</h3>
        {mappings.filter((mapping) => mapping.tableId === table.id).length ? mappings.filter((mapping) => mapping.tableId === table.id).map((mapping) => <MappingCard key={mapping.id} mapping={mapping} companies={companies} pcmsoSources={pcmsoSources}/>) : <p className="permission-note">Nenhuma associação foi registrada para esta tabela nesta consultoria.</p>}
      </div>
    </section>)}
  </main>;
}
