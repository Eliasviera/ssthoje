"use client";

import { useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import type { WorkingEntry } from "@/lib/pgr-working-store";
import { workingDocumentItems } from "@/lib/pgr-working-document";
import { ESOCIAL_CATALOG_SNAPSHOT } from "@/lib/esocial-catalog";
import DocumentPrintTemplate from "./document-print-template";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
const dateToday = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());
const NR_LIST_URL = "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs/normas-regulamentadoras-nrs";

export default function PgrPcmsoDraft({ profile, history, unitName, companyLogo }: { profile: ImportedPgrProfile; history: WorkingEntry[]; unitName: string; companyLogo?: string }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [medicalResponsible, setMedicalResponsible] = useState("Dra. Marina Exemplo (fictícia)");
  const [medicalCredential, setMedicalCredential] = useState("CRM/UF a preencher");
  const [examiningDoctors, setExaminingDoctors] = useState("");
  const [companyRepresentative, setCompanyRepresentative] = useState("");
  const risks = workingDocumentItems(profile, history, "risk").map(item => ({
    id: item.id, name: item.fields.name, activity: item.fields.activity, description: item.fields.description,
    harm: item.fields.harm, evidence: item.fields.evidence, role: item.fields.role, revision: item.revision,
  }));
  const companyName = profile.companyFields["Razao Social"]?.map(field => field.value).filter(Boolean).join(" / ") || "Empresa não identificada";
  const companyFields = Object.entries(profile.companyFields)
    .filter(([label]) => !["razao social", "responsavel tecnico", "responsavel legal"].some(fragment => normalize(label).includes(fragment)))
    .map(([label, values]) => ({ label: normalize(label).includes("responsavel legal") ? "Responsável legal" : label, value: values.map(field => field.value).filter(Boolean).join(" / ") }));
  const sections = [
    { id: "pcmso-draft-scope", title: "Origem, escopo e limitações" },
    { id: "pcmso-draft-occupational-exams", title: "Exames clínicos ocupacionais" },
    { id: "pcmso-draft-risk-review", title: "Riscos do PGR e planejamento de exames complementares" },
    { id: "pcmso-draft-quantitative", title: "Avaliações quantitativas relatadas" },
    { id: "pcmso-draft-pending", title: "Pendências para revisão médica" },
    { id: "pcmso-draft-sources", title: "Fontes oficiais para conferência" },
  ];
  const printDraft = () => {
    if (printing || typeof window.print !== "function") return;
    setPrinting(true);
    const root = document.getElementById("pgr-pcmso-draft-print");
    if (!root) { setPrinting(false); return; }
    const copy = root.cloneNode(true) as HTMLElement;
    copy.classList.add("pgr-import-print-copy");
    document.body.appendChild(copy);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; copy.remove(); window.removeEventListener("afterprint", finish); setPrinting(false); };
    window.addEventListener("afterprint", finish, { once: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { try { window.print(); } catch { finish(); } }));
  };

  return <section className="panel company-detail-panel pgr-pcmso-draft-panel" aria-labelledby="pgr-pcmso-draft-heading">
    <div className="panel-heading"><div><h2 id="pgr-pcmso-draft-heading">Minuta do PCMSO a partir deste PGR</h2><p>Preparação documental para análise do médico responsável.</p></div></div>
    <div className="document-warning"><strong>Minuta automática · não é PCMSO aprovado.</strong> Os riscos abaixo vêm do PGR extraído e das alterações salvas. A escolha de exames complementares, periodicidades e condutas exige avaliação do médico responsável; esta minuta não indica exames automaticamente.</div>
    <div className="client-card-actions"><button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Recolher minuta" : "Gerar e visualizar minuta"}</button>{open && <button type="button" className="primary-button" disabled={printing} onClick={printDraft}>{printing ? "Preparando impressão…" : "Imprimir minuta do PCMSO"}</button>}</div>
    {open && <fieldset className="pgr-pcmso-responsibility-fields"><legend>Responsáveis da minuta</legend><p>Os nomes usados nesta demonstração devem ser fictícios. O exemplo de coordenadora não registra assinatura digital nem aprova o PCMSO.</p><div><label className="form-field">Médico(a) responsável pelo PCMSO<input value={medicalResponsible} onChange={event => setMedicalResponsible(event.target.value)} maxLength={160} placeholder="Nome fictício do médico responsável"/></label><label className="form-field">CRM/UF do responsável<input value={medicalCredential} onChange={event => setMedicalCredential(event.target.value)} maxLength={60} placeholder="CRM/UF fictício ou a preencher"/></label><label className="form-field">Médicos examinadores (nomes e CRM/UF)<textarea value={examiningDoctors} onChange={event => setExaminingDoctors(event.target.value)} maxLength={1200} rows={3} placeholder="Use dados fictícios ou deixe para preencher pela organização"/></label><label className="form-field">Representante legal da empresa<input value={companyRepresentative} onChange={event => setCompanyRepresentative(event.target.value)} maxLength={160} placeholder="Nome fictício do representante"/></label></div></fieldset>}
    {open && <div id="pgr-pcmso-draft-print" className="pgr-working-document pgr-pcmso-draft-document">
      <DocumentPrintTemplate companyLogo={companyLogo} documentType="PCMSO" title="Minuta do Programa de Controle Médico de Saúde Ocupacional · PCMSO" companyName={companyName} companyFields={companyFields} authorName={medicalResponsible || "A designar"} authorRole="Médico responsável pelo PCMSO" professionalRegistration={medicalCredential} issueDate={dateToday()} sections={sections} consultancyPhone="64 99906-9494" consultancyEmail="eliasvieiraeng@gmail.com" preparationLabel="Consultoria SST Hoje" professionalHeading="Validação técnica sob responsabilidade de" responsibilityNote="Minuta preparada e organizada pela consultoria a partir do PGR. A validação técnica do PCMSO deve ser realizada pelo médico responsável designado; a assinatura do representante da empresa não substitui essa responsabilidade.">
        <section id="pcmso-draft-scope"><h3>1. Origem, escopo e limitações</h3><p>Empresa: {companyName}. Unidade vinculada ao PGR: {unitName}. Documento fonte cadastrado no sistema · {profile.pageCount} páginas. A extração contém {profile.roles.length} funções, {risks.length} registros de risco e {profile.exposures.length} quadros quantitativos. A minuta deve ser conferida com as condições reais de trabalho, trabalhadores e versão vigente do PGR.</p><p>Os registros importados são informações relatadas no PGR e alterações de trabalho salvas. A extração não comprova exposição nem substitui avaliação profissional. Referências às páginas são mantidas para rastreabilidade.</p></section>
        <section id="pcmso-draft-occupational-exams"><h3>2. Exames clínicos ocupacionais</h3><p>Planejar os exames clínicos ocupacionais aplicáveis conforme NR-7 e circunstâncias do vínculo: admissional, periódico, retorno ao trabalho, mudança de riscos ocupacionais e demissional. O médico responsável deve definir prazos, conteúdo clínico, critérios e condutas conforme o programa e os riscos avaliados.</p><p>Para empregados expostos a riscos ocupacionais identificados e classificados no PGR, a NR-7 prevê exame clínico periódico anual ou em intervalo menor a critério do médico responsável, observadas as regras específicas da norma. Confirmar a periodicidade aplicável a cada grupo antes de aprovar esta minuta.</p><h4>Médicos examinadores</h4><p>A organização deve informar este PCMSO a todos os médicos que realizarem exames ocupacionais. Registrar abaixo os médicos examinadores e respectivos CRM/UF, vinculando-os ao serviço ou unidade de atendimento. Os campos devem ser preenchidos e conferidos pela organização/serviço médico.</p><article className="pgr-card"><p><strong>Responsável pelo PCMSO:</strong> {medicalResponsible || "A designar"} · {medicalCredential || "CRM/UF a preencher"}</p><p><strong>Médicos examinadores:</strong><br/>{examiningDoctors || "A preencher: nome completo, CRM/UF e serviço/unidade de atendimento."}</p></article></section>
        <section id="pcmso-draft-risk-review"><h3>3. Riscos do PGR e planejamento de exames complementares</h3><p>Para cada item, o médico responsável deve avaliar possíveis agravos, necessidade de exame complementar, procedimento, momento/periodicidade e justificativa normativa/clínica. Registrar decisão e responsável em versão revisada do PCMSO.</p>{risks.map((risk,index) => {
          const linkedRoles = profile.roles.filter(role => role.riskAssociations.some(association => normalize(association.Origem ?? "") === normalize(risk.activity ?? "") && normalize(association.Perigo ?? "") === normalize(risk.name)));
          const roles = [...new Set([risk.role, ...linkedRoles.map(role => role.role)].filter(Boolean))];
          return <article className="pgr-card pcmso-draft-risk" key={risk.id}><h4>{index+1}. {risk.name || "Perigo não descrito"}</h4><p>Atividade: {risk.activity || "A conferir no PGR"}{roles.length ? ` · Funções relacionadas: ${roles.join(", ")}` : " · Função exposta: a confirmar"}</p>{risk.description && <p>Fonte/circunstância: {risk.description}</p>}{risk.harm && <p>Agravo possível relatado: {risk.harm}</p>}<p>Complementares: <strong>A avaliar e definir pelo médico responsável.</strong> Procedimento, periodicidade e justificativa: pendentes de revisão.</p><p>eSocial: relacionar o agente à Tabela 24/S-2240 quando aplicável; preencher procedimento/código da Tabela 27 no contexto do S-2220 somente após decisão e realização do exame, conforme leiaute vigente.</p><small>Origem: {risk.evidence || `PGR importado · risco ${risk.id}`}{risk.revision ? ` · alteração salva revisão ${risk.revision}` : " · extração da fonte"}</small></article>;
        })}</section>
        <section id="pcmso-draft-quantitative"><h3>4. Avaliações quantitativas relatadas</h3><p>Dados transcritos para orientar a conferência médica; revisar resultado, unidade, método e associação com cada função no documento original.</p>{profile.exposures.map((exposure,index) => <article className="pgr-card" key={`${exposure.page}-${index}`}><h4>Quadro {index+1} · página {exposure.page}</h4><p>Data: {exposure.date || "não informada"} · intensidade/resultado: {exposure.intensity || "não identificado"} · nível de ação: {exposure.actionLevel || "não informado"} · limite: {exposure.limit || "não informado"} · técnica: {exposure.method || "não identificada"}</p></article>)}</section>
        <section id="pcmso-draft-pending"><h3>5. Pendências para revisão médica</h3><ul><li>Conferir o PGR vigente, a classificação dos riscos e os grupos/funções expostos com a organização.</li><li>Definir os exames complementares necessários por risco e população exposta, com procedimento, periodicidade, fundamento e critérios de conduta.</li><li>Confirmar o planejamento dos exames clínicos ocupacionais e as situações individuais de aplicação, sem incluir dados clínicos nesta minuta.</li><li>Identificar os médicos examinadores, CRM/UF e serviços/unidades onde os exames serão realizados; assegurar que conheçam e atendam ao PCMSO.</li><li>Validar correspondência de agentes à Tabela 24 do eSocial e de procedimentos diagnósticos à Tabela 27; a minuta não transmite eventos.</li><li>Substituir os dados fictícios pelo médico do trabalho indicado, confirmar registro profissional, assinatura, data e versão validada. A organização deve confirmar os dados do estabelecimento e sua implantação.</li></ul><p><strong>Status:</strong> preparada pela consultoria · pendente de validação técnica pelo médico responsável pelo PCMSO e ciência da organização.</p></section>
        <section id="pcmso-draft-sources"><h3>6. Fontes oficiais para conferência</h3><ul><li><a href={NR_LIST_URL}>{NR_LIST_URL}</a> — listagem oficial do MTE que inclui a NR-7. Conferir o texto, alterações, versão e vigência diretamente na publicação oficial antes da revisão do PCMSO.</li><li><a href={ESOCIAL_CATALOG_SNAPSHOT.sourceUrl}>{ESOCIAL_CATALOG_SNAPSHOT.sourceUrl}</a> — snapshot local do catálogo: {ESOCIAL_CATALOG_SNAPSHOT.sourceVersion}. Confirmar a versão vigente e a aplicabilidade do código ao caso concreto; este snapshot não valida vigência individual nem gera/transmite eventos.</li></ul></section>
        <section className="pgr-signatures"><h3>Responsabilidades e validação</h3><div className="pgr-signature-grid"><div><div className="pgr-signature-line"/><strong>{medicalResponsible || "Médico responsável pelo PCMSO"}</strong><span>{medicalCredential || "CRM/UF a preencher"}</span><span>Validação técnica · data: ____/____/________</span></div><div><div className="pgr-signature-line"/><strong>{companyRepresentative || "Representante legal da empresa"}</strong><span>Ciência dos dados e compromisso de implantação</span><span>Data: ____/____/________</span></div></div><p>A assinatura do representante da empresa não substitui a validação médica do PCMSO.</p></section>
      </DocumentPrintTemplate>
    </div>}
  </section>;
}
