"use client";

import { useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import type { WorkingEntry } from "@/lib/pgr-working-store";
import { workingDocumentItems } from "@/lib/pgr-working-document";
import DocumentPrintTemplate from "./document-print-template";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateToday = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());
const previdenciaryAgentPattern = /ru[ií]do|vibra[cç]|calor|frio|radia[cç]|poeira|particul|fumos|qu[ií]mic|solvente|chumbo|biol[oó]g|microorgan/i;

export default function PgrLtcatDraft({ profile, history, unitName, companyLogo }: { profile: ImportedPgrProfile; history: WorkingEntry[]; unitName: string; companyLogo?: string }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [author, setAuthor] = useState("");
  const [authorType, setAuthorType] = useState("Engenheiro(a) de Segurança do Trabalho");
  const [professionalRegistration, setProfessionalRegistration] = useState("");
  const [measurementProvider, setMeasurementProvider] = useState("");
  const [measurementProfessional, setMeasurementProfessional] = useState("");
  const [measurementReferences, setMeasurementReferences] = useState("");
  const [periodReviewed, setPeriodReviewed] = useState("");
  const [changesSinceMeasurement, setChangesSinceMeasurement] = useState("");
  const [companyRepresentative, setCompanyRepresentative] = useState("");
  const candidates = workingDocumentItems(profile, history, "risk").filter(risk => previdenciaryAgentPattern.test(normalize(`${risk.fields.name} ${risk.fields.description} ${risk.fields.harm}`)));
  const noiseAndPhysicalMeasurements = profile.exposures;
  const companyName = profile.companyFields["Razao Social"]?.map(field => field.value).filter(Boolean).join(" / ") || "Empresa não identificada";
  const companyFields = Object.entries(profile.companyFields)
    .filter(([label]) => !["razao social", "responsavel tecnico", "responsavel legal"].some(fragment => normalize(label).includes(fragment)))
    .map(([label, values]) => ({ label, value: values.map(field => field.value).filter(Boolean).join(" / ") }));
  const sections = [
    { id: "ltcat-scope", title: "Objeto, escopo e origem" },
    { id: "ltcat-jobs", title: "Funções e agentes a conferir" },
    { id: "ltcat-measurements", title: "Avaliações quantitativas relatadas" },
    { id: "ltcat-evidence", title: "Evidências e condições de validade" },
    { id: "ltcat-pending", title: "Responsabilidade técnica e pendências" },
  ];
  const printDraft = () => {
    if (printing || typeof window.print !== "function") return;
    setPrinting(true);
    const root = document.getElementById("pgr-ltcat-draft-print");
    if (!root) { setPrinting(false); return; }
    const copy = root.cloneNode(true) as HTMLElement;
    copy.classList.add("pgr-import-print-copy");
    document.body.appendChild(copy);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; copy.remove(); window.removeEventListener("afterprint", finish); setPrinting(false); };
    window.addEventListener("afterprint", finish, { once: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { try { window.print(); } catch { finish(); } }));
  };

  return <section className="panel company-detail-panel pgr-ltcat-draft-panel" aria-labelledby="pgr-ltcat-draft-heading">
    <div className="panel-heading"><div><h2 id="pgr-ltcat-draft-heading">Minuta de apoio à elaboração do LTCAT</h2><p>Organiza evidências ambientais do PGR · não emite conclusão previdenciária.</p></div></div>
    <div className="document-warning"><strong>Roteiro/minuta de trabalho · não é LTCAT emitido.</strong> A emissão do LTCAT requer elaboração e assinatura de médico do trabalho ou engenheiro de segurança do trabalho. Os dados do PGR são relatos extraídos e precisam ser confrontados com condições reais, avaliações ambientais e documentos originais. Não concluir exposição efetiva, enquadramento previdenciário ou direito a benefício automaticamente.</div>
    <div className="client-card-actions"><button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Recolher minuta" : "Gerar e visualizar minuta"}</button>{open && <button type="button" className="primary-button" disabled={printing} onClick={printDraft}>{printing ? "Preparando impressão…" : "Imprimir roteiro do LTCAT"}</button>}</div>
    {open && <fieldset className="pgr-pcmso-responsibility-fields"><legend>Responsável técnico e evidências</legend><p>Informe o autor legalmente habilitado e identifique as empresas/profissionais que realizaram medições. Laudos e certificados completos podem permanecer como PDFs anexos, com referência neste roteiro. Campos temporários, sem assinatura digital.</p><div>
      <label className="form-field">Responsável pelo LTCAT<input value={author} onChange={event => setAuthor(event.target.value)} maxLength={160} placeholder="Nome completo do médico do trabalho ou engenheiro de segurança"/></label>
      <label className="form-field">Qualificação profissional<select value={authorType} onChange={event => setAuthorType(event.target.value)}><option>Engenheiro(a) de Segurança do Trabalho</option><option>Médico(a) do Trabalho</option></select></label>
      <label className="form-field">Conselho / registro profissional<input value={professionalRegistration} onChange={event => setProfessionalRegistration(event.target.value)} maxLength={120} placeholder="CREA/UF ou CRM/UF"/></label>
      <label className="form-field">Empresa que realizou as avaliações ambientais<input value={measurementProvider} onChange={event => setMeasurementProvider(event.target.value)} maxLength={200} placeholder="Razão social e CNPJ, ou indicar que foi equipe própria"/></label>
      <label className="form-field">Responsável pelas medições / registro profissional<input value={measurementProfessional} onChange={event => setMeasurementProfessional(event.target.value)} maxLength={240} placeholder="Nome, qualificação e conselho/registro"/></label>
      <label className="form-field">Referências dos laudos, certificados de calibração e anexos<textarea value={measurementReferences} onChange={event => setMeasurementReferences(event.target.value)} maxLength={2000} rows={3} placeholder="Identificação dos PDFs anexos, número, data e repositório"/></label>
      <label className="form-field">Período das condições e avaliações revisadas<input value={periodReviewed} onChange={event => setPeriodReviewed(event.target.value)} maxLength={160} placeholder="Período coberto pelos documentos e inspeção técnica"/></label>
      <label className="form-field">Alterações desde as avaliações / limitações de representatividade<textarea value={changesSinceMeasurement} onChange={event => setChangesSinceMeasurement(event.target.value)} maxLength={2000} rows={3} placeholder="Mudanças em processo, layout, controles, jornada, equipamentos, insumos ou função"/></label>
      <label className="form-field">Representante legal da empresa<input value={companyRepresentative} onChange={event => setCompanyRepresentative(event.target.value)} maxLength={160} placeholder="Nome do representante"/></label>
    </div></fieldset>}
    {open && <div id="pgr-ltcat-draft-print" className="pgr-working-document pgr-ltcat-draft-document">
      <DocumentPrintTemplate companyLogo={companyLogo} documentType="LTCAT" title="Roteiro técnico para elaboração do Laudo Técnico das Condições Ambientais do Trabalho · LTCAT" companyName={companyName} companyFields={companyFields} authorName={author || "A designar"} authorRole={authorType} professionalRegistration={professionalRegistration} issueDate={dateToday()} sections={sections} consultancyPhone="64 99906-9494" consultancyEmail="eliasvieiraeng@gmail.com" preparationLabel="Consultoria SST Hoje · organização de dados da fonte" professionalHeading="Emissão e responsabilidade técnica legal" responsibilityNote="Documento preparatório organizado pela consultoria com informações extraídas do PGR. Somente o médico do trabalho ou engenheiro de segurança do trabalho responsável, após avaliação técnica e documental, poderá emitir o LTCAT e firmar suas conclusões.">
        <section id="ltcat-scope"><h3>1. Objeto, escopo e origem</h3><p>Empresa: {companyName}. Unidade: {unitName}. Fonte: PGR cadastrado, {profile.pageCount} páginas; versão da fonte {profile.sha256.slice(0, 12)}.</p><p>Finalidade do roteiro: reunir funções, agentes e avaliações ambientais relatadas para conferência pelo responsável técnico do LTCAT. A extração não substitui inspeção, dosimetria, laudo, análise de representatividade ou avaliação da exposição efetiva do segurado.</p><p>Referência legal: <a href="https://www.presidencia.gov.br/ccivil_03/leis/l8213cons.htm">Lei nº 8.213/1991, art. 58, § 1º</a>. O eSocial esclarece que o LTCAT é elaborado por médico do trabalho ou engenheiro de segurança do trabalho. O LTCAT tem finalidade previdenciária e não se confunde com o PGR nem substitui suas finalidades preventivas.</p></section>
        <section id="ltcat-jobs"><h3>2. Funções e agentes a conferir</h3><p>{candidates.length} registros com menção a agentes físicos, químicos ou biológicos foram localizados para conferência. A relação é uma triagem automática por palavras-chave e não significa exposição previdenciária reconhecida.</p>{candidates.length ? candidates.map((risk, index) => <article className="pgr-card" key={risk.id}><h4>{index + 1}. {risk.fields.name || "Agente a identificar"}</h4><p>Função/atividade: {risk.fields.activity || "A conferir"} · setor: {risk.fields.sector || "A conferir"}</p>{risk.fields.description && <p>Fonte/circunstância relatada: {risk.fields.description}</p>}{risk.fields.harm && <p>Agravo relatado no PGR: {risk.fields.harm}</p>}{risk.fields.controls && <p>Medidas/EPI relatados na fonte: {risk.fields.controls}</p>}<p><strong>Revisão previdenciária:</strong> identificar agente, fonte, intensidade/concentração, duração, habitualidade/permanência e efetividade dos controles conforme critérios aplicáveis; conclusão a cargo do responsável do LTCAT.</p><small>Origem: {risk.fields.evidence || `PGR cadastrado · risco ${risk.id}`}</small></article>) : <p>Nenhum agente localizado na triagem. Conferir documento integral e condições reais.</p>}</section>
        <section id="ltcat-measurements"><h3>3. Avaliações quantitativas relatadas no PGR</h3><p>Resultados transcritos da fonte. Conferir método, unidade, grupo avaliado, instrumento, certificado de calibração, responsável e representatividade. Não usar os valores isoladamente para concluir enquadramento previdenciário.</p>{noiseAndPhysicalMeasurements.length ? noiseAndPhysicalMeasurements.map((measurement, index) => <article className="pgr-card" key={`${measurement.page}-${index}`}><h4>Avaliação {index + 1} · página {measurement.page}</h4><p>Data: {measurement.date || "não informada"} · intensidade/resultado: {measurement.intensity || "não informado"} · nível de ação relatado: {measurement.actionLevel || "não informado"} · limite relatado: {measurement.limit || "não informado"} · técnica: {measurement.method || "não informada"}</p><p>Instrumento, calibração, estratégia e laudo completo: conferir no relatório original ou anexo documental.</p></article>) : <p>Nenhuma avaliação quantitativa extraída do PGR.</p>}</section>
        <section id="ltcat-evidence"><h3>4. Evidências e condições de validade</h3><p><strong>Empresa de medição:</strong> {measurementProvider || "A identificar"} · <strong>Responsável pelas medições:</strong> {measurementProfessional || "A identificar"}</p><p><strong>Laudos/certificados referenciados:</strong> {measurementReferences || "Anexar ou referenciar relatórios originais, certificados de calibração e demais evidências."}</p><p><strong>Período revisado:</strong> {periodReviewed || "A definir a partir dos documentos e avaliação técnica"}</p><p><strong>Mudanças/representatividade:</strong> {changesSinceMeasurement || "Conferir se os ambientes, processos, controles, equipamentos, insumos, jornadas e tarefas atuais correspondem ao período avaliado."}</p><p>As empresas que fizeram as medições podem ser distintas da consultoria do PGR. Registrar autoria e rastreabilidade de cada evidência, mantendo laudos e certificados íntegros como anexos documentais.</p></section>
        <section id="ltcat-pending"><h3>5. Responsabilidade técnica e pendências</h3><ul><li>Inspecionar ambientes, atividades, funções e períodos cobertos e verificar as condições atuais e históricas relevantes.</li><li>Conferir método, instrumentos, calibração, estratégia de amostragem, grupos e relatórios originais com os respectivos responsáveis técnicos.</li><li>Reavaliar agentes e medidas de controle com base nos critérios previdenciários aplicáveis, sem transpor conclusões do PGR automaticamente.</li><li>Documentar conclusões, limites da avaliação, período, responsáveis, registros profissionais e assinatura técnica do LTCAT.</li><li>Conferir coerência entre LTCAT, PPP e informações do evento S-2240 antes de qualquer declaração previdenciária.</li></ul><p><strong>Responsável técnico:</strong> {author || "A designar"} · {authorType} · {professionalRegistration || "Registro profissional a preencher"}</p><p><strong>Representante legal:</strong> {companyRepresentative || "A preencher"}</p><p><strong>Status:</strong> roteiro preparado pela consultoria · LTCAT não emitido; pendente de avaliação e assinatura pelo profissional legalmente habilitado.</p></section>
      </DocumentPrintTemplate>
    </div>}
  </section>;
}
