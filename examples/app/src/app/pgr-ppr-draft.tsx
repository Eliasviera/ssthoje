"use client";

import { useState } from "react";
import type { ImportedPgrProfile } from "@/lib/pgr-digitalization-store";
import type { WorkingEntry } from "@/lib/pgr-working-store";
import { workingDocumentItems } from "@/lib/pgr-working-document";
import DocumentPrintTemplate from "./document-print-template";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const dateToday = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());

export default function PgrPprDraft({ profile, history, unitName }: { profile: ImportedPgrProfile; history: WorkingEntry[]; unitName: string }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [administrator, setAdministrator] = useState("");
  const [administratorRole, setAdministratorRole] = useState("Enfermeiro(a) do Trabalho");
  const [administratorLink, setAdministratorLink] = useState<"internal" | "contracted">("internal");
  const [serviceProvider, setServiceProvider] = useState("");
  const [administratorQualification, setAdministratorQualification] = useState("");
  const [healthProfessional, setHealthProfessional] = useState("");
  const [healthProfessionalRegistration, setHealthProfessionalRegistration] = useState("");
  const [companyRepresentative, setCompanyRepresentative] = useState("");
  const [fitTestMethod, setFitTestMethod] = useState("");
  const [fitTestProvider, setFitTestProvider] = useState("");
  const [fitTestRecordRef, setFitTestRecordRef] = useState("");
  const risks = workingDocumentItems(profile, history, "risk");
  const respiratoryRisks = risks.filter(risk => /respirat|inala|fumos|poeira|poeiras|vapores|névoa|nevoa|solvente|tinta|químic|quimic|particul/i.test(`${risk.fields.name} ${risk.fields.description} ${risk.fields.harm} ${risk.fields.activity}`));
  const companyName = profile.companyFields["Razao Social"]?.map(field => field.value).filter(Boolean).join(" / ") || "Empresa não identificada";
  const companyFields = Object.entries(profile.companyFields)
    .filter(([label]) => !["razao social", "responsavel tecnico", "responsavel legal"].some(fragment => normalize(label).includes(fragment)))
    .map(([label, values]) => ({ label, value: values.map(field => field.value).filter(Boolean).join(" / ") }));
  const sections = [
    { id: "ppr-scope", title: "Objetivo, escopo e origem" },
    { id: "ppr-risk-map", title: "Riscos respiratórios identificados no PGR" },
    { id: "ppr-operating-procedures", title: "Procedimentos do programa a definir" },
    { id: "ppr-pending", title: "Pendências e evidências" },
  ];
  const printDraft = () => {
    if (printing || typeof window.print !== "function") return;
    setPrinting(true);
    const root = document.getElementById("pgr-ppr-draft-print");
    if (!root) { setPrinting(false); return; }
    const copy = root.cloneNode(true) as HTMLElement;
    copy.classList.add("pgr-import-print-copy");
    document.body.appendChild(copy);
    let finished = false;
    const finish = () => { if (finished) return; finished = true; copy.remove(); window.removeEventListener("afterprint", finish); setPrinting(false); };
    window.addEventListener("afterprint", finish, { once: true });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { try { window.print(); } catch { finish(); } }));
  };

  return <section className="panel company-detail-panel pgr-ppr-draft-panel" aria-labelledby="pgr-ppr-draft-heading">
    <div className="panel-heading"><div><h2 id="pgr-ppr-draft-heading">Minuta do PPR a partir deste PGR</h2><p>Primeira versão de teste · conteúdo extraído para revisão do administrador do programa.</p></div></div>
    <div className="document-warning"><strong>Minuta · não é PPR aprovado.</strong> O PGR da EMA relata riscos e controles, mas não comprova condições atuais nem valida a seleção de respiradores/filtros. O administrador designado deve completar o programa com observação, FDS, avaliações de exposição, instruções dos fabricantes e participação da organização. A avaliação médica dos usuários deve ser feita por profissional de saúde quando aplicável.</div>
    <div className="client-card-actions"><button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Recolher minuta" : "Gerar e visualizar minuta"}</button>{open && <button type="button" className="primary-button" disabled={printing} onClick={printDraft}>{printing ? "Preparando impressão…" : "Imprimir minuta do PPR"}</button>}</div>
    {open && <fieldset className="pgr-pcmso-responsibility-fields"><legend>Responsáveis e revisão</legend><p>Registre quem administra o PPR e sua qualificação específica em proteção respiratória. A função pode ser exercida por profissional interno ou serviço terceirizado, conforme designação e responsabilidades da organização. A orientação médica e a avaliação clínica ficam identificadas separadamente. Preencher os dados reais antes de validar; estes campos são temporários e não registram assinatura digital.</p><div>
      <label className="form-field">Vínculo do administrador<select value={administratorLink} onChange={event => setAdministratorLink(event.target.value as "internal" | "contracted")}><option value="internal">Profissional da empresa</option><option value="contracted">Serviço / profissional terceirizado</option></select></label>
      <label className="form-field">Função do administrador<select value={administratorRole} onChange={event => setAdministratorRole(event.target.value)}><option>Enfermeiro(a) do Trabalho</option><option>Técnico(a) de Enfermagem do Trabalho</option><option>Profissional de SST com conhecimento em proteção respiratória</option><option>Outro profissional designado</option></select></label>
      <label className="form-field">Administrador(a) do PPR<input value={administrator} onChange={event => setAdministrator(event.target.value)} maxLength={160} placeholder="Nome completo do administrador designado"/></label>
      {administratorLink === "contracted" && <label className="form-field">Empresa / serviço terceirizado<input value={serviceProvider} onChange={event => setServiceProvider(event.target.value)} maxLength={200} placeholder="Razão social e CNPJ do prestador"/></label>}
      <label className="form-field">Qualificação / experiência em proteção respiratória<input value={administratorQualification} onChange={event => setAdministratorQualification(event.target.value)} maxLength={300} placeholder="Formação, capacitação ou experiência pertinente"/></label>
      <label className="form-field">Médico orientador / responsável pela avaliação de saúde<input value={healthProfessional} onChange={event => setHealthProfessional(event.target.value)} maxLength={160} placeholder="Nome do médico do trabalho responsável"/></label>
      <label className="form-field">CRM/UF do médico<input value={healthProfessionalRegistration} onChange={event => setHealthProfessionalRegistration(event.target.value)} maxLength={120} placeholder="CRM/UF"/></label>
      <label className="form-field">Método previsto para ensaio de vedação<select value={fitTestMethod} onChange={event => setFitTestMethod(event.target.value)}><option value="">A definir pelo administrador</option><option>Qualitativo · quando tecnicamente aplicável</option><option>Quantitativo · quando requerido/aplicável</option><option>Definido por procedimento técnico específico</option></select></label>
      <label className="form-field">Responsável / serviço que executa os ensaios<input value={fitTestProvider} onChange={event => setFitTestProvider(event.target.value)} maxLength={200} placeholder="Profissional interno ou empresa terceirizada"/></label>
      <label className="form-field">Referência do procedimento / registros de ensaio<input value={fitTestRecordRef} onChange={event => setFitTestRecordRef(event.target.value)} maxLength={240} placeholder="Código do procedimento ou local do registro individual restrito"/></label>
      <label className="form-field">Representante da empresa<input value={companyRepresentative} onChange={event => setCompanyRepresentative(event.target.value)} maxLength={160} placeholder="Nome do representante legal"/></label>
    </div></fieldset>}
    {open && <div id="pgr-ppr-draft-print" className="pgr-working-document pgr-ppr-draft-document">
      <DocumentPrintTemplate documentType="PPR" title="Minuta do Programa de Proteção Respiratória · PPR" companyName={companyName} companyFields={companyFields} authorName={administrator || "A designar"} authorRole={`${administratorRole} · administrador(a) do PPR (${administratorLink === "contracted" ? "terceirizado" : "quadro da empresa"})`} professionalRegistration={administratorQualification} issueDate={dateToday()} sections={sections} consultancyPhone="64 99906-9494" consultancyEmail="eliasvieiraeng@gmail.com" preparationLabel={administratorLink === "contracted" ? `Consultoria SST Hoje · serviço informado: ${serviceProvider || "a preencher"}` : "Consultoria SST Hoje"} professionalHeading="Administração e revisão do programa" responsibilityNote="Minuta organizada pela Consultoria SST Hoje a partir do PGR cadastrado. A organização deve designar o administrador do PPR e fornecer recursos e autoridade. A avaliação médica de aptidão para uso de respirador é uma etapa de saúde ocupacional quando indicada e não substitui a administração do programa.">
        <section id="ppr-scope"><h3>1. Objetivo, escopo e origem</h3><p>Empresa: {companyName}. Unidade: {unitName}. Fonte: PGR cadastrado, {profile.pageCount} páginas; revisão do documento fonte {profile.sha256.slice(0, 12)}.</p><p>Esta minuta organiza as informações respiratórias localizadas no PGR para orientar a implantação de um programa. A identificação automática não substitui avaliação das condições reais, composição e FDS dos produtos, concentração ambiental, tarefa, jornada, controles coletivos e usuários.</p><p>Referências para revisão pelo administrador: <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/institucional/historico/portaria-mtp-no-672-procedimentos-sst-2-1.pdf">Portaria MTP nº 672/2021, arts. 44 e 45</a> e <a href="https://www.gov.br/fundacentro/pt-br/comunicacao/noticias/noticias/2016/6/quarta-edicao-do-livro-programa-de-protecao-respiratoria-esta-disponivel-no-portal-da">Programa de Proteção Respiratória da Fundacentro, 4ª edição</a>. Conferir a redação normativa e referências técnicas vigentes na aprovação.</p><p>O programa deve ser dimensionado para os riscos respiratórios efetivamente existentes e manter procedimentos e registros atualizados. Não selecionar respirador ou filtro automaticamente a partir deste rascunho.</p></section>
        <section id="ppr-risk-map"><h3>2. Riscos respiratórios identificados no PGR</h3><p>{respiratoryRisks.length} registros foram selecionados por menção a risco respiratório, produto químico ou proteção respiratória. Conferir cada registro com a fonte e com o processo atual.</p>{respiratoryRisks.length ? respiratoryRisks.map((risk, index) => <article className="pgr-card" key={risk.id}><h4>{index + 1}. {risk.fields.name || "Perigo sem descrição"}</h4><p>Atividade: {risk.fields.activity || "A confirmar"} · função/setor: {risk.fields.role || "A confirmar"}</p>{risk.fields.description && <p>Fonte e circunstância: {risk.fields.description}</p>}{risk.fields.harm && <p>Agravo informado: {risk.fields.harm}</p>}{risk.fields.controls && <p>Controles/EPI relatados no PGR: {risk.fields.controls}</p>}<p><strong>Decisão do PPR:</strong> exposição, controles, respirador, filtro e fator de proteção a avaliar pelo administrador designado; não inferidos por esta minuta.</p><small>Origem: {risk.fields.evidence || `PGR cadastrado · risco ${risk.id}`}</small></article>) : <p>Nenhum registro respiratório localizado por palavra-chave. O administrador deve conferir o PGR integral e as atividades observadas.</p>}</section>
        <section id="ppr-operating-procedures"><h3>3. Procedimentos do programa a definir</h3><p>Completar e aprovar procedimentos escritos com critérios apropriados ao risco, ao respirador selecionado, aos fabricantes e às referências técnicas vigentes.</p><ul>
          <li>Administração do programa, atribuições, autoridade, recursos e revisão periódica.</li>
          <li>Identificação e monitoramento dos riscos respiratórios; critérios para seleção, limitações, filtros e troca, fundamentados nas avaliações e nas instruções do fabricante.</li>
          <li>Avaliação médica do candidato ao uso de respirador quando indicada, articulada com o PCMSO e preservando sigilo médico.</li>
          <li>Ensaio de vedação aplicável aos respiradores com contato facial: definir método qualitativo ou quantitativo conforme tipo de peça facial, procedimento técnico vigente e publicação da Fundacentro; manter registro individual do resultado, modelo/tamanho testado, data, executor e providências.</li>
          <li>Tratar reprovação como bloqueio do modelo/tamanho para aquele usuário: verificar colocação, ajuste, tamanho/modelo, interferências e condições do ensaio; selecionar alternativa compatível e repetir o ensaio. Não liberar a peça para uso se não houver resultado aprovado.</li>
          <li>Orientação e treinamento dos usuários; colocação, verificação de vedação, uso, limitações e resposta a falhas/emergências.</li>
          <li>Inspeção, higienização, manutenção, guarda, descarte e reposição de respiradores e filtros.</li>
          <li>Registros de entrega, treinamento, avaliações, ensaios, inspeções, manutenção e revisão periódica do programa.</li>
        </ul><p>Não há instrução de uso ou troca de filtro preenchida automaticamente; o responsável deve definir e registrar a frequência conforme avaliação, fabricante e condições reais.</p></section>
        <section id="ppr-pending"><h3>4. Pendências e evidências para validação</h3><ul>
          <li>Confirmar a lista de trabalhadores, funções, tarefas, turnos e cenários abrangidos pelo PPR.</li>
          <li>Revisar produtos e FDS, dados de avaliações ambientais, controles de engenharia e registros de manutenção/exaustão.</li>
          <li>Selecionar respiradores e filtros compatíveis com os agentes e concentrações, verificando aprovação, limitações, ajuste e compatibilidade com outros EPI.</li>
          <li>Definir e documentar ensaios de vedação, avaliações médicas quando indicadas, treinamentos e critérios de troca.</li>
          <li>Anexar ou referenciar laudos de medição, FDS, certificados, fichas de EPI, treinamentos e evidências de manutenção.</li>
          <li>Registrar designação e qualificação do administrador, revisão do programa, aprovação organizacional e datas de monitoramento.</li>
        </ul><h4>Ensaio de vedação · preencher no procedimento do PPR</h4><p><strong>Método previsto:</strong> {fitTestMethod || "A definir pelo administrador conforme respirador e procedimento técnico aplicável"}</p><p><strong>Executor / serviço:</strong> {fitTestProvider || "A designar"} · <strong>Referência dos registros:</strong> {fitTestRecordRef || "A preencher; manter resultados individuais em registro controlado"}</p><p><strong>Regra para reprovação:</strong> não liberar o modelo/tamanho reprovado para o usuário; investigar ajuste, selecionar alternativa compatível e repetir o ensaio até obter resultado aprovado. A seleção do respirador e a necessidade de avaliação médica permanecem decisões dos responsáveis competentes.</p><p><strong>Administrador(a) do PPR:</strong> {administrator || "A designar"} · {administratorRole} · {administratorLink === "contracted" ? `terceirizado · ${serviceProvider || "empresa prestadora a identificar"}` : "profissional da empresa"} · {administratorQualification || "Qualificação a informar"}</p><p><strong>Médico orientador / avaliação de saúde, quando indicada:</strong> {healthProfessional || "A preencher"} · {healthProfessionalRegistration || "CRM/UF a preencher"}</p><p><strong>Organização:</strong> {companyRepresentative || "Representante e compromisso de implantação a preencher"}</p><p><strong>Status:</strong> minuta preparada pela consultoria · pendente de avaliação do administrador designado e implantação pela organização.</p></section>
      </DocumentPrintTemplate>
    </div>}
  </section>;
}
