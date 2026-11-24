"use client";

import { useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import type { WorkingEntry } from "@/lib/pgr-working-store";
import { workingDocumentItems } from "@/lib/pgr-working-document";
import DocumentPrintTemplate from "./document-print-template";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateToday = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());

export default function PgrPcaDraft({ profile, history, unitName, companyLogo }: { profile: ImportedPgrProfile; history: WorkingEntry[]; unitName: string; companyLogo?: string }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [healthCoordinator, setHealthCoordinator] = useState("");
  const [healthCredential, setHealthCredential] = useState("");
  const [audiometryProvider, setAudiometryProvider] = useState("");
  const [audiometryProfessional, setAudiometryProfessional] = useState("");
  const [audiometryCredential, setAudiometryCredential] = useState("");
  const [team, setTeam] = useState("");
  const [companyRepresentative, setCompanyRepresentative] = useState("");
  const risks = workingDocumentItems(profile, history, "risk").filter(risk => /ru[ií]do|protetor auditivo|audiç|audiç|auditiv/i.test(`${risk.fields.name} ${risk.fields.description} ${risk.fields.harm} ${risk.fields.controls}`));
  const quantitativeNoise = profile.exposures.filter(exposure => /dB\s*\(?A\)?/i.test(`${exposure.intensity} ${exposure.actionLevel} ${exposure.limit}`) || /NHO\s*0?1|ANEXO\s*1\s*NR\s*15/i.test(exposure.method));
  const companyName = profile.companyFields["Razao Social"]?.map(field => field.value).filter(Boolean).join(" / ") || "Empresa não identificada";
  const companyFields = Object.entries(profile.companyFields)
    .filter(([label]) => !["razao social", "responsavel tecnico", "responsavel legal"].some(fragment => normalize(label).includes(fragment)))
    .map(([label, values]) => ({ label, value: values.map(field => field.value).filter(Boolean).join(" / ") }));
  const sections = [
    { id: "pca-scope", title: "Objetivo, escopo e origem" },
    { id: "pca-risk-map", title: "Ruído e funções identificados no PGR" },
    { id: "pca-measurements", title: "Avaliações quantitativas relatadas" },
    { id: "pca-actions", title: "Eixos de prevenção e acompanhamento" },
    { id: "pca-pending", title: "Pendências, equipe e validação" },
  ];
  const printDraft = () => {
    if (printing || typeof window.print !== "function") return;
    setPrinting(true);
    const root = document.getElementById("pgr-pca-draft-print");
    if (!root) { setPrinting(false); return; }
    const copy = root.cloneNode(true) as HTMLElement;
    copy.classList.add("pgr-import-print-copy");
    document.body.appendChild(copy);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; copy.remove(); window.removeEventListener("afterprint", finish); setPrinting(false); };
    window.addEventListener("afterprint", finish, { once: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { try { window.print(); } catch { finish(); } }));
  };

  return <section className="panel company-detail-panel pgr-pca-draft-panel" aria-labelledby="pgr-pca-draft-heading">
    <div className="panel-heading"><div><h2 id="pgr-pca-draft-heading">Minuta do PCA a partir deste PGR</h2><p>Segundo documento de teste · conservação auditiva e prevenção de perdas auditivas.</p></div></div>
    <div className="document-warning"><strong>Minuta · não é PCA/PCMSO aprovado.</strong> Os riscos e medições abaixo foram extraídos do PGR da EMA; confirme-os com os laudos originais e as condições atuais. A equipe de saúde e a equipe multidisciplinar devem validar o programa. Não inclua dados audiométricos pessoais nesta minuta.</div>
    <div className="client-card-actions"><button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Recolher minuta" : "Gerar e visualizar minuta"}</button>{open && <button type="button" className="primary-button" disabled={printing} onClick={printDraft}>{printing ? "Preparando impressão…" : "Imprimir minuta do PCA"}</button>}</div>
    {open && <fieldset className="pgr-pcmso-responsibility-fields"><legend>Equipe responsável e validação</legend><p>Preencha os profissionais e participantes reais. A coordenação é multidisciplinar; diagnóstico, interpretação clínica e condutas relacionadas à audição são responsabilidades médicas. Os campos são temporários e não registram aprovação ou assinatura digital.</p><div>
      <label className="form-field">Profissional de saúde coordenador do PCA<input value={healthCoordinator} onChange={event => setHealthCoordinator(event.target.value)} maxLength={160} placeholder="Nome do responsável de saúde designado"/></label>
      <label className="form-field">Conselho / registro do coordenador<input value={healthCredential} onChange={event => setHealthCredential(event.target.value)} maxLength={120} placeholder="CRM/UF, CRFa/UF ou registro aplicável"/></label>
      <label className="form-field">Serviço que realiza audiometrias<input value={audiometryProvider} onChange={event => setAudiometryProvider(event.target.value)} maxLength={200} placeholder="Serviço interno ou empresa terceirizada"/></label>
      <label className="form-field">Profissional que executa audiometrias<input value={audiometryProfessional} onChange={event => setAudiometryProfessional(event.target.value)} maxLength={160} placeholder="Médico ou fonoaudiólogo"/></label>
      <label className="form-field">Conselho / registro profissional<input value={audiometryCredential} onChange={event => setAudiometryCredential(event.target.value)} maxLength={120} placeholder="CRM/UF ou CRFa/UF"/></label>
      <label className="form-field">Equipe multidisciplinar<textarea value={team} onChange={event => setTeam(event.target.value)} maxLength={1000} rows={3} placeholder="Saúde, fonoaudiologia, SST, engenharia, gestão e representantes dos trabalhadores"/></label>
      <label className="form-field">Representante da organização<input value={companyRepresentative} onChange={event => setCompanyRepresentative(event.target.value)} maxLength={160} placeholder="Nome do representante responsável pela implantação"/></label>
    </div></fieldset>}
    {open && <div id="pgr-pca-draft-print" className="pgr-working-document pgr-pca-draft-document">
      <DocumentPrintTemplate companyLogo={companyLogo} documentType="PCA" title="Minuta do Programa de Conservação Auditiva · PCA" companyName={companyName} companyFields={companyFields} authorName={healthCoordinator || "A designar"} authorRole="Coordenação de saúde ocupacional em equipe multidisciplinar" professionalRegistration={healthCredential} issueDate={dateToday()} sections={sections} consultancyPhone="64 99906-9494" consultancyEmail="eliasvieiraeng@gmail.com" preparationLabel="Consultoria SST Hoje" professionalHeading="Coordenação e validação multidisciplinar" responsibilityNote="Minuta preparada pela consultoria a partir do PGR. O PCA requer integração entre saúde ocupacional, audiologia, SST, gestão e trabalhadores. A avaliação clínica, o diagnóstico, a aptidão e as condutas são atribuições médicas; a execução de audiometrias cabe a médico ou fonoaudiólogo conforme a NR-7.">
        <section id="pca-scope"><h3>1. Objetivo, escopo e origem</h3><p>Empresa: {companyName}. Unidade: {unitName}. Fonte: PGR cadastrado, {profile.pageCount} páginas; revisão do documento fonte {profile.sha256.slice(0, 12)}.</p><p>Esta minuta organiza os registros de ruído e proteção auditiva localizados no PGR para orientar a elaboração do PCA. Confirmar setores, funções, trabalhadores abrangidos, jornada e exposições atuais com a empresa e com os relatórios ambientais completos.</p><p>Referências para validação: <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-07-atualizada-2022-1.pdf">NR-7, Anexo II</a> e <a href="https://www.gov.br/fundacentro/pt-br/centrais-de-conteudo/biblioteca/publicacoes-institucionais">Guia de diretrizes e parâmetros mínimos da Fundacentro para elaboração e gestão do PCA</a>. Conferir redação e referências vigentes na validação.</p></section>
        <section id="pca-risk-map"><h3>2. Ruído e funções identificados no PGR</h3><p>{risks.length} fichas de risco relacionadas a ruído/proteção auditiva foram localizadas. A extração identifica função e página de origem; não confirma exposição atual nem efetividade dos controles.</p>{risks.length ? risks.map((risk, index) => <article className="pgr-card" key={risk.id}><h4>{index + 1}. {risk.fields.name || "Ruído"}</h4><p>Atividade/função: {risk.fields.activity || risk.fields.role || "A confirmar"} · setor: {risk.fields.sector || "A confirmar"}</p>{risk.fields.description && <p>Fonte/circunstância informada: {risk.fields.description}</p>}{risk.fields.harm && <p>Agravo informado: {risk.fields.harm}</p>}{risk.fields.controls && <p>Medidas e EPI relatados no PGR: {risk.fields.controls}</p>}<small>Origem: {risk.fields.evidence || `PGR cadastrado · risco ${risk.id}`}</small></article>) : <p>Não foram localizadas fichas por busca automática. Conferir o PGR integral e as atividades reais.</p>}</section>
        <section id="pca-measurements"><h3>3. Avaliações quantitativas relatadas</h3><p>Valores transcritos da fonte; não constituem nova avaliação nem confirmação de dosimetria representativa. Conferir laudo, instrumento, calibração, estratégia de amostragem, jornada e grupos homogêneos de exposição.</p>{quantitativeNoise.length ? quantitativeNoise.map((measurement, index) => <article className="pgr-card" key={`${measurement.page}-${index}`}><h4>Avaliação {index + 1} · página {measurement.page}</h4><p>Data: {measurement.date || "não informada"} · resultado/intensidade: {measurement.intensity || "não informado"} · nível de ação informado: {measurement.actionLevel || "não informado"} · limite informado: {measurement.limit || "não informado"} · método: {measurement.method || "não informado"}</p><p>Laudo original, responsável pela medição e certificado de calibração: anexar ou referenciar no repositório documental.</p></article>) : <p>Não foram reconhecidos resultados em dB(A) ou métodos de ruído. Verificar a fonte integral.</p>}</section>
        <section id="pca-actions"><h3>4. Eixos de prevenção e acompanhamento</h3><ul>
          <li>Rever riscos e grupos expostos no PGR, incluindo vibração e agentes ototóxicos quando aplicáveis, e atualizar avaliações ambientais com apoio do responsável competente.</li>
          <li>Priorizar eliminação/redução do ruído na fonte e medidas coletivas/administrativas; documentar intervenções, responsáveis, prazos e verificação de eficácia.</li>
          <li>Definir gestão dos protetores auditivos: seleção compatível com o risco, CA válido, ajuste, compatibilidade, entrega, uso, higienização, conservação e substituição, sem confiar apenas na atenuação nominal.</li>
          <li>Integrar vigilância audiológica ao PCMSO, programar audiometrias conforme NR-7 e preservar resultados individuais em prontuário sob guarda médica.</li>
          <li>Orientar e capacitar trabalhadores, lideranças e equipes envolvidas; registrar conteúdo, participação, data e revisão.</li>
          <li>Monitorar resultados coletivos sem expor dados pessoais, investigar tendências, revisar medidas e registrar indicadores e ações de melhoria.</li>
        </ul><p>Periodicidade, protocolos e decisões clínicas devem ser definidos pelo médico responsável pelo PCMSO em conjunto com os profissionais de saúde competentes. O sistema não importa nem publica dados audiométricos individuais.</p></section>
        <section id="pca-pending"><h3>5. Pendências, equipe e validação</h3><ul>
          <li>Confirmar grupos expostos, resultados, métodos e laudos originais de avaliação de ruído, incluindo referências à calibração dos instrumentos.</li>
          <li>Conferir protetores auditivos fornecidos, Certificados de Aprovação, compatibilidade, registros de entrega, orientação e efetividade dos controles.</li>
          <li>Definir junto ao médico do PCMSO a vigilância audiológica, execução das audiometrias e fluxo de avaliação/encaminhamento, sem inserir prontuários nesta minuta.</li>
          <li>Estabelecer plano de ação com medidas coletivas, responsáveis, prazos e verificação de eficácia, com participação dos trabalhadores.</li>
          <li>Registrar equipe multidisciplinar, serviços contratados, qualificação, responsável médico, versão aprovada e calendário de revisão.</li>
        </ul><p><strong>Coordenação de saúde:</strong> {healthCoordinator || "A designar"} · {healthCredential || "Registro profissional a preencher"}</p><p><strong>Serviço / profissional de audiometria:</strong> {audiometryProvider || "Serviço a identificar"} · {audiometryProfessional || "Médico ou fonoaudiólogo a identificar"} · {audiometryCredential || "CRM/UF ou CRFa/UF a preencher"}</p><p><strong>Equipe multidisciplinar:</strong> {team || "Participantes e qualificações a preencher"}</p><p><strong>Organização:</strong> {companyRepresentative || "Representante e implantação a confirmar"}</p><p><strong>Status:</strong> minuta preparada pela consultoria · pendente de validação pelos profissionais de saúde/equipe multidisciplinar e implantação pela organização.</p></section>
      </DocumentPrintTemplate>
    </div>}
  </section>;
}
