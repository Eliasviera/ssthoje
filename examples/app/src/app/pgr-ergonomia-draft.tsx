"use client";

import { useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import type { WorkingEntry } from "@/lib/pgr-working-store";
import { workingDocumentItems } from "@/lib/pgr-working-document";
import DocumentPrintTemplate from "./document-print-template";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateToday = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());
const ergonomicPattern = /postura|sentad|em pe|em pé|inadequada|movimenta[cç][aã]o de materiais|levantamento|transporte manual|esfor[cç]o f[ií]sico|repetitiv|ergon[oô]m|psicossocial/i;

export default function PgrErgonomiaDraft({ profile, history, unitName }: { profile: ImportedPgrProfile; history: WorkingEntry[]; unitName: string }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [evaluator, setEvaluator] = useState("");
  const [evaluatorQualification, setEvaluatorQualification] = useState("");
  const [healthReviewer, setHealthReviewer] = useState("");
  const [healthCredential, setHealthCredential] = useState("");
  const [team, setTeam] = useState("");
  const [workersConsulted, setWorkersConsulted] = useState("");
  const [method, setMethod] = useState("");
  const [workOrganization, setWorkOrganization] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [companyRepresentative, setCompanyRepresentative] = useState("");
  const risks = workingDocumentItems(profile, history, "risk").filter(risk => ergonomicPattern.test(normalize(`${risk.fields.name} ${risk.fields.activity} ${risk.fields.description} ${risk.fields.harm}`)));
  const companyName = profile.companyFields["Razao Social"]?.map(field => field.value).filter(Boolean).join(" / ") || "Empresa não identificada";
  const companyFields = Object.entries(profile.companyFields)
    .filter(([label]) => !["razao social", "responsavel tecnico", "responsavel legal"].some(fragment => normalize(label).includes(fragment)))
    .map(([label, values]) => ({ label, value: values.map(field => field.value).filter(Boolean).join(" / ") }));
  const sections = [
    { id: "ergonomia-scope", title: "Objetivo, escopo e origem" },
    { id: "ergonomia-risk-map", title: "Fatores ergonômicos no PGR" },
    { id: "ergonomia-observations", title: "Observação, método e participação" },
    { id: "ergonomia-actions", title: "Recomendações e plano de ação" },
    { id: "ergonomia-aet", title: "Critérios de aprofundamento em AET" },
    { id: "ergonomia-pending", title: "Equipe, validação e pendências" },
  ];
  const printDraft = () => {
    if (printing || typeof window.print !== "function") return;
    setPrinting(true);
    const root = document.getElementById("pgr-ergonomia-draft-print");
    if (!root) { setPrinting(false); return; }
    const copy = root.cloneNode(true) as HTMLElement;
    copy.classList.add("pgr-import-print-copy");
    document.body.appendChild(copy);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; copy.remove(); window.removeEventListener("afterprint", finish); setPrinting(false); };
    window.addEventListener("afterprint", finish, { once: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { try { window.print(); } catch { finish(); } }));
  };

  return <section className="panel company-detail-panel pgr-ergonomia-draft-panel" aria-labelledby="pgr-ergonomia-draft-heading">
    <div className="panel-heading"><div><h2 id="pgr-ergonomia-draft-heading">Minuta da avaliação ergonômica (AEP)</h2><p>Avaliação preliminar conectada ao PGR · AET quando os critérios normativos forem identificados.</p></div></div>
    <div className="document-warning"><strong>Minuta · não é AEP/AET concluída.</strong> Os fatores abaixo foram extraídos do PGR da EMA. A avaliação exige observação das situações reais, escuta dos trabalhadores, método adequado e registro pela organização. A triagem automática não faz diagnóstico ergonômico nem determina se a AET é dispensável.</div>
    <div className="client-card-actions"><button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Recolher minuta" : "Gerar e visualizar minuta"}</button>{open && <button type="button" className="primary-button" disabled={printing} onClick={printDraft}>{printing ? "Preparando impressão…" : "Imprimir minuta da AEP"}</button>}</div>
    {open && <fieldset className="pgr-pcmso-responsibility-fields"><legend>Responsáveis, método e participação</legend><p>A NR-17 exige registro da AEP, participação/escuta dos trabalhadores e, na AET, etapas de análise, diagnóstico, recomendações e restituição/validação. Indique profissionais responsáveis conforme qualificação e atribuições aplicáveis. Campos temporários, sem assinatura digital.</p><div>
      <label className="form-field">Avaliador(a) responsável<input value={evaluator} onChange={event => setEvaluator(event.target.value)} maxLength={160} placeholder="Nome do profissional que conduzirá a avaliação"/></label>
      <label className="form-field">Qualificação / conselho / registro<input value={evaluatorQualification} onChange={event => setEvaluatorQualification(event.target.value)} maxLength={240} placeholder="Qualificação pertinente e registro aplicável"/></label>
      <label className="form-field">Profissional de saúde que revisará aspectos de saúde, quando indicado<input value={healthReviewer} onChange={event => setHealthReviewer(event.target.value)} maxLength={160} placeholder="Nome e função"/></label>
      <label className="form-field">Conselho / registro profissional<input value={healthCredential} onChange={event => setHealthCredential(event.target.value)} maxLength={120} placeholder="Registro aplicável"/></label>
      <label className="form-field">Equipe multidisciplinar<textarea value={team} onChange={event => setTeam(event.target.value)} maxLength={1000} rows={3} placeholder="Saúde, ergonomia, SST, gestão, trabalhadores e outros participantes"/></label>
      <label className="form-field">Trabalhadores/grupos ouvidos e forma de participação<textarea value={workersConsulted} onChange={event => setWorkersConsulted(event.target.value)} maxLength={1500} rows={3} placeholder="Funções, grupos, datas, entrevistas/observações/reuniões e contribuições"/></label>
      <label className="form-field">Método, técnicas e ferramentas<textarea value={method} onChange={event => setMethod(event.target.value)} maxLength={1500} rows={3} placeholder="Descrever método escolhido e justificar sua adequação à situação"/></label>
      <label className="form-field">Organização do trabalho e observações<textarea value={workOrganization} onChange={event => setWorkOrganization(event.target.value)} maxLength={2000} rows={4} placeholder="Tarefas, ritmo, pausas, metas, variabilidade, exigências físicas/cognitivas e condições reais"/></label>
      <label className="form-field">Recomendações preliminares / medidas a avaliar<textarea value={recommendations} onChange={event => setRecommendations(event.target.value)} maxLength={2000} rows={4} placeholder="Registrar medidas após observação e discussão com trabalhadores; não presumir pausas ou rodízio sem análise"/></label>
      <label className="form-field">Representante da organização<input value={companyRepresentative} onChange={event => setCompanyRepresentative(event.target.value)} maxLength={160} placeholder="Responsável por analisar e acompanhar a implantação"/></label>
    </div></fieldset>}
    {open && <div id="pgr-ergonomia-draft-print" className="pgr-working-document pgr-ergonomia-draft-document">
      <DocumentPrintTemplate documentType="ERGONOMIA" title="Minuta da Avaliação Ergonômica Preliminar · AEP" companyName={companyName} companyFields={companyFields} authorName={evaluator || "A designar"} authorRole="Profissional responsável pela avaliação ergonômica" professionalRegistration={evaluatorQualification} issueDate={dateToday()} sections={sections} consultancyPhone="64 99906-9494" consultancyEmail="eliasvieiraeng@gmail.com" preparationLabel="Consultoria SST Hoje" professionalHeading="Responsável pela avaliação e revisão multidisciplinar" responsibilityNote="Minuta estruturada pela consultoria a partir do PGR. A organização deve registrar a avaliação ergonômica preliminar, assegurar a participação dos trabalhadores e implementar medidas de prevenção. A análise aprofundada (AET) deve ser realizada nas situações previstas pela NR-17.">
        <section id="ergonomia-scope"><h3>1. Objetivo, escopo e origem</h3><p>Empresa: {companyName}. Unidade: {unitName}. Fonte: PGR cadastrado, {profile.pageCount} páginas; versão da fonte {profile.sha256.slice(0, 12)}.</p><p>Esta minuta organiza os fatores ergonômicos mencionados no PGR para orientar a AEP. Os registros são relatos documentais e devem ser verificados nas tarefas reais, incluindo variações, ritmos, organização e percepção dos trabalhadores.</p><p>Referência: <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/arquivos/normas-regulamentadoras/nr-17-atualizada-2022.pdf">NR-17, capítulo 17.3</a>. A AEP deve ser registrada; a AET aprofunda a análise quando acionada pelas hipóteses normativas.</p></section>
        <section id="ergonomia-risk-map"><h3>2. Fatores ergonômicos relatados no PGR</h3><p>{risks.length} registros foram localizados por termos posturais, movimentação, levantamento ou ergonomia. Confirmar quais se aplicam às condições atuais e identificar perigos omitidos.</p>{risks.length ? risks.map((risk, index) => <article className="pgr-card" key={risk.id}><h4>{index + 1}. {risk.fields.name || "Fator a avaliar"}</h4><p>Função/atividade: {risk.fields.activity || "A confirmar"} · setor: {risk.fields.sector || "A confirmar"}</p>{risk.fields.description && <p>Fonte/circunstância relatada: {risk.fields.description}</p>}{risk.fields.harm && <p>Agravo possível informado: {risk.fields.harm}</p>}{risk.fields.controls && <p>Medidas registradas na fonte: {risk.fields.controls}</p>}<p><strong>Análise AEP:</strong> completar após observação, diálogo com trabalhadores e aplicação do método definido.</p><small>Origem: {risk.fields.evidence || `PGR cadastrado · risco ${risk.id}`}</small></article>) : <p>Nenhum fator localizado por busca automática. Conferir o PGR integral e as situações reais de trabalho.</p>}</section>
        <section id="ergonomia-observations"><h3>3. Observação, método e participação</h3><p><strong>Método/técnica:</strong> {method || "A definir e justificar pelo avaliador responsável conforme risco, atividade e requisitos aplicáveis."}</p><p><strong>Trabalhadores ouvidos e participação:</strong> {workersConsulted || "A registrar: grupos/funções, datas, forma de escuta e contribuições."}</p><p><strong>Organização do trabalho e condições observadas:</strong> {workOrganization || "A avaliar em campo: exigências físicas e cognitivas, conteúdo das tarefas, ritmo, pausas, metas, variabilidade, mobiliário, equipamentos, ferramentas e ambiente."}</p></section>
        <section id="ergonomia-actions"><h3>4. Recomendações e plano de ação</h3><p>{recommendations || "Recomendações a definir após avaliação e discussão com os trabalhadores. Priorizar medidas que eliminem ou reduzam o fator de risco, definir responsável, prazo, recursos e forma de verificar eficácia."}</p><p>As recomendações devem ser compatíveis com a atividade real e incorporadas ao plano de ação do PGR quando aplicável. Registrar retorno aos trabalhadores e revisão das intervenções.</p></section>
        <section id="ergonomia-aet"><h3>5. Critérios para aprofundamento em AET</h3><p>A NR-17 prevê AET quando: (a) for necessária avaliação mais aprofundada; (b) ações adotadas forem inadequadas ou insuficientes; (c) o acompanhamento de saúde sugerir sua necessidade; ou (d) a análise de acidente/doença relacionada ao trabalho indicar causa nas condições de trabalho.</p><p>Quando aplicável, a AET deve documentar: análise da demanda e reformulação do problema; funcionamento da organização, processos, situações e atividade; justificativa e aplicação dos métodos/técnicas; diagnóstico; recomendações; restituição dos resultados, validação e revisão das intervenções com participação dos trabalhadores.</p><p><strong>Decisão nesta minuta:</strong> AET necessária? A avaliar em campo · justificativa e responsável: a preencher.</p></section>
        <section id="ergonomia-pending"><h3>6. Equipe, validação e pendências</h3><ul><li>Observar tarefas e variações em cada função e validar com os trabalhadores se os riscos extraídos refletem a realidade.</li><li>Definir e registrar método, técnicas, evidências, diagnóstico preliminar, medidas, responsáveis e prazos.</li><li>Consultar profissionais de saúde sobre aspectos de saúde e achados coletivos, preservando sigilo e dados clínicos individuais.</li><li>Verificar critérios para AET e registrar decisão fundamentada; realizar aprofundamento quando previsto na NR-17.</li><li>Vincular recomendações ao PGR e monitorar implementação e eficácia com participação dos trabalhadores.</li></ul><p><strong>Avaliador(a):</strong> {evaluator || "A designar"} · {evaluatorQualification || "Qualificação e registro a informar"}</p><p><strong>Revisão de saúde (quando aplicável):</strong> {healthReviewer || "Profissional a identificar"} · {healthCredential || "Registro a preencher"}</p><p><strong>Equipe multidisciplinar:</strong> {team || "Participantes e funções a informar"}</p><p><strong>Organização:</strong> {companyRepresentative || "Representante e compromisso de acompanhamento a preencher"}</p><p><strong>Status:</strong> minuta da AEP preparada pela consultoria · pendente de avaliação, participação dos trabalhadores, validação da organização e encaminhamento para AET quando indicado.</p></section>
      </DocumentPrintTemplate>
    </div>}
  </section>;
}
