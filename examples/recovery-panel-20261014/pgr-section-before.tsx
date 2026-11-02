"use client";

import { useActionState } from "react";
import type { ClientCompany } from "@/lib/client-store";
import type { PgrDraft } from "@/lib/pgr-store";
import { approvePgrDraftAction, savePgrDraftAction, submitPgrDraftAction } from "./pgr-actions";

function DraftForm({ companies, draft }: { companies: ClientCompany[]; draft?: PgrDraft }) {
  const [state, action, pending] = useActionState(savePgrDraftAction, {});
  const selectedKey = draft ? `${draft.companyId}|${draft.unitId}` : "";
  return <form action={action} className="pgr-form">
    {draft && <input type="hidden" name="draftId" value={draft.id}/>}
    <div className="form-field"><label htmlFor={`pgr-title-${draft?.id ?? "new"}`}>Nome do rascunho</label><input id={`pgr-title-${draft?.id ?? "new"}`} name="title" required maxLength={140} defaultValue={draft?.title} placeholder="PGR — unidade de demonstração"/></div>
    <div className="form-field"><label htmlFor={`pgr-company-${draft?.id ?? "new"}`}>Empresa e unidade</label><select id={`pgr-company-${draft?.id ?? "new"}`} name="companyUnit" required defaultValue={selectedKey}><option value="" disabled>Selecione</option>{companies.filter((company) => company.status === "active").flatMap((company) => company.units.map((unit) => <option key={unit.id} value={`${company.id}|${unit.id}`}>{company.tradeName || company.legalName} · {unit.name}</option>))}</select></div>
    <div className="form-field pgr-wide"><label htmlFor={`pgr-activity-${draft?.id ?? "new"}`}>Atividades e contexto do local</label><textarea id={`pgr-activity-${draft?.id ?? "new"}`} name="activityDescription" required maxLength={3000} defaultValue={draft?.activityDescription} rows={3} placeholder="Descreva as atividades observadas pela equipe, sem incluir dados pessoais."/></div>
    <div className="form-field pgr-wide"><label htmlFor={`pgr-risks-${draft?.id ?? "new"}`}>Inventário de perigos e riscos informado pela equipe</label><textarea id={`pgr-risks-${draft?.id ?? "new"}`} name="riskInventory" required maxLength={5000} defaultValue={draft?.riskInventory} rows={4} placeholder="Registre observações e evidências para revisão profissional. O sistema não classifica nem calcula riscos."/></div>
    <div className="form-field pgr-wide"><label htmlFor={`pgr-actions-${draft?.id ?? "new"}`}>Plano de ação</label><textarea id={`pgr-actions-${draft?.id ?? "new"}`} name="actionPlan" required maxLength={5000} defaultValue={draft?.actionPlan} rows={4} placeholder="Ação, responsável e prazo definidos pela equipe responsável. Não há prazos automáticos."/></div>
    {state.error && <p className="client-form-message client-form-error" role="alert">{state.error}</p>}{state.success && <p className="client-form-message client-form-success" role="status">{state.success}</p>}
    <div className="pgr-form-footer"><p>O conteúdo será salvo como rascunho local e exige revisão humana antes de qualquer uso.</p><button className="primary-button" type="submit" disabled={pending}>{pending ? "Salvando…" : draft ? "Atualizar rascunho" : "Salvar rascunho"}</button></div>
  </form>;
}

const statusLabel = { draft: "Rascunho", in_review: "Em revisão", approved: "Revisado internamente" } as const;
const nr1Source = "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-01-atualizada-2025-i-3.pdf";
const nrIndexSource = "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes";
const nr26Source = "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-26-atualizada-2022.pdf";

function PgrDocument({ record, company, unit }: { record: PgrDraft; company?: ClientCompany; unit?: ClientCompany["units"][number] }) {
  const cnpj = unit?.cnpj.replace(/\D/g, "");
  const formattedCnpj = cnpj?.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : unit?.cnpj;
  const riskLines = record.riskInventory.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const riskEntries = riskLines.map((line) => {
    const normalized = line.replace(/^[•*-]\s*/, "");
    const separator = normalized.indexOf(":");
    return { title: separator > 0 ? normalized.slice(0, separator) : "Cenário informado", details: separator > 0 ? normalized.slice(separator + 1).trim() : normalized, isEntry: /^[•*-]\s*/.test(line) };
  });
  const actionEntries = record.actionPlan.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\.\s*(.*)$/);
    return { number: match?.[1], text: match?.[2] ?? line };
  });
  const assessmentFor = (details: string) => {
    const match = details.match(/frequ[eê]ncia\s+(baixa|m[eé]dia|alta)[^\n.]{0,80}?gravidade\s+(baixa|m[eé]dia|alta)/i);
    return match ? `Informadas: frequência ${match[1].toLowerCase()} e gravidade ${match[2].toLowerCase()}; validar o nível pela matriz da organização.` : "Não individualizadas neste relato; avaliar conforme o método e a matriz da organização.";
  };
  return <div className="pgr-content pgr-document">
    <header className="pgr-document-title"><p>PROGRAMA DE GERENCIAMENTO DE RISCOS · PGR</p><span>Documento de demonstração · revisão {record.revision} · {statusLabel[record.status]}</span></header>
    <section><h5>1. Identificação da organização e do estabelecimento</h5><dl className="pgr-identification">
      <dt>Razão social</dt><dd>{company?.legalName || "Não informada"}</dd>
      <dt>Nome fantasia</dt><dd>{company?.tradeName || "Não informado"}</dd>
      <dt>Unidade</dt><dd>{unit?.name || "Não informada"}</dd>
      <dt>CNPJ</dt><dd>{formattedCnpj || "Não informado"}</dd>
      <dt>Município/UF</dt><dd>{unit?.cityState || "A confirmar"}</dd>
    </dl></section>
    <section><h5>2. Base normativa e finalidade</h5><p>O gerenciamento de riscos ocupacionais deve ser implementado por estabelecimento e formalizado no PGR. A NR-1 estabelece como documentos mínimos o inventário de riscos ocupacionais e o plano de ação. O texto integral vigente e suas alterações devem ser conferidos na fonte oficial do Ministério do Trabalho e Emprego. As demais Normas Regulamentadoras devem ser identificadas e aplicadas conforme os riscos, atividades, equipamentos e locais efetivamente verificados.</p><p className="pgr-legal-reference">Referência principal: NR-1, capítulo 1.5, especialmente itens 1.5.3 a 1.5.7 · <a href={nr1Source} target="_blank" rel="noreferrer">texto vigente publicado pelo MTE</a>.</p></section>
    <section><h5>3. Referencial normativo aplicável — mapa preliminar</h5><p className="pgr-structure-note">Este enquadramento organiza as fontes legais antes da avaliação particular. É uma síntese de orientação, não transcrição integral da lei. O profissional deve confirmar a redação e vigência oficiais, selecionar os itens aplicáveis ao escopo real e registrar como cada requisito se relaciona aos perigos, controles, evidências e ações.</p><div className="pgr-normative-wrap"><table className="pgr-normative-table"><thead><tr><th>Referência</th><th>Matéria a verificar no cenário</th><th>Aplicação neste PGR</th></tr></thead><tbody>
      <tr><th>NR-1, cap. 1.5</th><td>GRO/PGR, avaliação e classificação de riscos, inventário, plano de ação, preparação para emergências e documentação.</td><td>Estrutura central do documento; detalhar metodologia, inventário e ações por estabelecimento.</td></tr>
      <tr><th>NR-6 · NR-7 · NR-9</th><td>EPI; vigilância de saúde ocupacional; avaliação e controle das exposições a agentes físicos, químicos e biológicos.</td><td>Vincular seleção/uso de EPI, PCMSO e avaliações de exposição aos riscos identificados; registrar evidências pertinentes.</td></tr>
      <tr><th>NR-10 · NR-12</th><td>Serviços e instalações elétricas; segurança em máquinas e equipamentos.</td><td>Verificar manutenção elétrica, desenergização/bloqueios e máquinas como viradeira, serras e equipamentos efetivamente usados.</td></tr>
      <tr><th>NR-11 · NR-17</th><td>Movimentação e manuseio de materiais; ergonomia.</td><td>Analisar içamentos/interface com contratadas, movimentação de peças, posturas, esforços e organização do trabalho.</td></tr>
      <tr><th>NR-20 · NR-23 · NR-26</th><td>Inflamáveis/combustíveis, proteção contra incêndios e comunicação de perigos químicos. Na NR-26, itens 26.4.1 a 26.5: classificação pelo GHS, rotulagem preventiva, FDS e informação/treinamento.</td><td>Identificar tintas, solventes e demais produtos; conferir classificação, rótulos, acesso às FDS e treinamento; usar esses dados na avaliação de exposição, prevenção e emergência.</td></tr>
      <tr><th>NR-33 · NR-35</th><td>Trabalho em espaços confinados e trabalho em altura.</td><td>Aplicar conforme caracterização do espaço, tarefa, acesso e exposição; integrar procedimentos e emergências com o cliente.</td></tr>
      <tr><th>Outras NRs e regras do cliente</th><td>Requisitos adicionais conforme atividade, setor, instalação, equipamento e contrato.</td><td>Verificar caso a caso. NR-18, NR-13 e outras não são presumidas aplicáveis apenas pelo nome da atividade ou do equipamento.</td></tr>
    </tbody></table></div><p className="pgr-legal-reference">Fontes oficiais: <a href={nrIndexSource} target="_blank" rel="noreferrer">repositório de Normas Regulamentadoras vigentes do MTE</a> · <a href={nr1Source} target="_blank" rel="noreferrer">NR-1 vigente</a> · <a href={nr26Source} target="_blank" rel="noreferrer">NR-26, itens 26.4.1 a 26.5 (GHS, rótulos, FDS e treinamento)</a>. Registrar edição/versão e itens específicos revisados na validação técnica.</p></section>
    <section><h5>4. Caracterização dos processos, ambientes e atividades</h5><p>{record.activityDescription}</p></section>
    <section><h5>5. Metodologia e critérios de avaliação</h5><p>Documentar a ferramenta/método adotado, os critérios de gradação da severidade e da probabilidade, os níveis de risco e os critérios de classificação e decisão (NR-1, item 1.5.4.4.2.2). Registrar avaliações por perigo, atividade e cenário real, considerando exposição e eficácia das medidas; incluir aspectos ergonômicos e fatores psicossociais relacionados ao trabalho, conforme aplicável. No material informado até aqui, a matriz e seus critérios detalhados não foram registrados.</p></section>
    <section><h5>6. Inventário de riscos ocupacionais</h5><p className="pgr-structure-note">Consolidar os dados por perigo/risco conforme os nove elementos da NR-1, item 1.5.7.3.2:</p><ol className="pgr-requirements"><li>processos e ambientes de trabalho;</li><li>atividades;</li><li>perigos, suas fontes e circunstâncias;</li><li>possíveis lesões ou agravos à saúde;</li><li>grupos de trabalhadores expostos;</li><li>medidas de prevenção implementadas;</li><li>caracterização da exposição;</li><li>análise preliminar/monitoramento de agentes físicos, químicos e biológicos e resultados da avaliação ergonômica, conforme aplicabilidade;</li><li>avaliação dos riscos e classificação para orientar o plano de ação.</li></ol><p className="pgr-reported-label">Relatos e avaliações iniciais fornecidos pelo responsável, ainda pendentes de validação e consolidação por atividade e grupo exposto:</p><div className="pgr-risk-list">{riskEntries.map((entry, index) => entry.isEntry ? <article className="pgr-risk-entry" key={`${entry.title}-${index}`}><h6>{entry.title}</h6><p className="pgr-risk-original"><strong>Relato recebido:</strong> {entry.details}</p><dl className="pgr-field-grid">
      <dt>Atividade / ambiente</dt><dd>Relacionar à tarefa e ao local observados; a descrição geral consta na seção 4.</dd>
      <dt>Perigo, fonte e circunstância</dt><dd>Conferir e especificar a partir do relato acima, por situação de trabalho.</dd>
      <dt>Possíveis agravos</dt><dd>Listar as consequências plausíveis para cada perigo e validar tecnicamente.</dd>
      <dt>Grupo exposto</dt><dd>Identificar funções e trabalhadores efetivamente expostos em cada etapa.</dd>
      <dt>Prevenção e exposição</dt><dd>Verificar medidas existentes, eficácia, frequência/duração e evidências; incluir avaliações ocupacionais aplicáveis.</dd>
      <dt>Avaliação informada</dt><dd>{assessmentFor(entry.details)}</dd>
    </dl>{/pintura|solvente|produto químico/i.test(`${entry.title} ${entry.details}`) && <div className="pgr-chemical-note"><strong>Verificação GHS / NR-26 para este cenário:</strong> relacionar cada tinta, solvente ou outro produto à sua classificação de perigos, ao rótulo e à FDS correspondente; verificar se a equipe tem acesso à FDS e treinamento para compreender rótulos/FDS, perigos, medidas preventivas e resposta a emergências. Usar essas informações na avaliação da exposição e na seleção de controles. A FDS, isoladamente, não substitui a avaliação das condições reais de uso e exposição. Articular seleção de respirador, PPR e fit test conforme avaliação e programa aplicáveis.</div>}</article> : <p className="pgr-risk-context" key={`context-${index}`}>{entry.details}</p>)}</div><p className="pgr-structure-note">Os campos acima tornam visíveis as informações que faltam; eles não são preenchidos por inferência automática. Completar e validar cada cenário com observação, documentos e medições aplicáveis.</p></section>
    <section><h5>7. Plano de ação</h5><div className="pgr-action-list">{actionEntries.map((entry, index) => <article className="pgr-action-entry" key={`action-${index}`}><span>{entry.number ? `Ação ${entry.number}` : "Ação"}</span><p>{entry.text}</p><dl className="pgr-action-fields"><dt>Responsável e prazo</dt><dd>A definir pela organização.</dd><dt>Acompanhamento e eficácia</dt><dd>Definir evidência, periodicidade e critério de verificação.</dd></dl></article>)}</div><p className="pgr-structure-note">Registrar cronograma, responsável, forma de acompanhamento e critério de aferição dos resultados para cada medida, conforme NR-1, item 1.5.5.2.2. Esses dados não foram preenchidos automaticamente.</p></section>
    <section><h5>8. Implementação, acompanhamento e resposta a emergências</h5><p>Registrar evidências de implantação e ajustes das medidas; planejar inspeções, acompanhamento da exposição quando aplicável e participação dos trabalhadores. Documentar os procedimentos de emergência, responsáveis e recursos para primeiros socorros, encaminhamento e abandono; avaliar exercícios simulados e integração com os planos dos clientes conforme os cenários reais (NR-1, itens 1.5.5.3 e 1.5.6).</p></section>
    <section><h5>9. Controle documental e aprovação</h5><p>Este registro permanece rascunho de demonstração. A organização deve validar o conteúdo, atribuir responsáveis, datar e assinar os documentos integrantes do PGR, disponibilizá-los aos trabalhadores interessados e manter o histórico de atualizações conforme a NR-1. Não há assinatura ou aprovação técnica automática neste sistema.</p></section>
    <p className="pgr-export-notice">DOCUMENTO DE DEMONSTRAÇÃO · As informações e classificações são relatos ainda sujeitos a validação profissional e em campo. Esta cópia não declara conformidade e não substitui o PGR concluído e aprovado pela organização.</p>
  </div>;
}

export default function PgrSection({ records, companies, canManage, canReview }: { records: PgrDraft[]; companies: ClientCompany[]; canManage: boolean; canReview: boolean }) {
  return <section className="panel pgr-section" aria-labelledby="pgr-title">
    <div className="panel-heading"><div><h2 id="pgr-title">PGR · elaboração assistida</h2><p>Organize informações e prepare um documento para revisão humana.</p></div><span className="period-label">Demonstração local</span></div>
    <div className="document-warning"><strong>O SST Hoje não avalia riscos nem confirma conformidade.</strong> As informações e decisões devem ser revisadas por profissionais responsáveis. A revisão registrada aqui não é assinatura nem parecer legal.</div>
    {canManage && (companies.length ? <DraftForm companies={companies}/> : <p className="permission-note">Cadastre uma empresa e unidade antes de iniciar um PGR fictício.</p>)}
    <div className="pgr-records"><h3>Rascunhos e revisões</h3>{records.length ? records.map((record) => {
      const company = companies.find((entry) => entry.id === record.companyId);
      const unit = company?.units.find((entry) => entry.id === record.unitId);
      return <article className="pgr-card" key={record.id}>
        <header><div><h4>{record.title}</h4><p>{company?.tradeName || company?.legalName || "Empresa"} · {unit?.name || "Unidade"} · revisão {record.revision}</p></div><span className="period-label">{statusLabel[record.status]}</span></header>
        <p className="pgr-export-notice">DOCUMENTO DE DEMONSTRAÇÃO · Conteúdo informado por pessoas, pendente de validação profissional. Não é parecer, assinatura ou declaração automática de conformidade.</p>
        {record.status === "draft" && canManage ? <details className="pgr-edit"><summary>Editar conteúdo</summary><DraftForm companies={companies} draft={record}/></details> : null}
        <PgrDocument record={record} company={company} unit={unit}/>
        {record.revisions.length > 1 && <details className="document-versions"><summary>Revisões anteriores · {record.revisions.length - 1}</summary><ul>{record.revisions.filter((revision) => revision.version < record.revision).slice().reverse().map((revision) => <li key={revision.version}><details><summary>Revisão {revision.version} · {revision.title}</summary><div className="pgr-content"><h5>Atividades e contexto</h5><p>{revision.activityDescription}</p><h5>Perigos e riscos registrados</h5><p>{revision.riskInventory}</p><h5>Plano de ação</h5><p>{revision.actionPlan}</p></div><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(revision.savedAt))} · conteúdo preservado</small></details></li>)}</ul></details>}
        {record.status === "draft" && canManage && <form action={submitPgrDraftAction}><input type="hidden" name="draftId" value={record.id}/><button className="secondary-button" type="submit">Enviar para revisão</button></form>}
        {record.status === "in_review" && canReview && <form action={approvePgrDraftAction}><input type="hidden" name="draftId" value={record.id}/><button className="secondary-button" type="submit">Registrar revisão interna</button></form>}
        {record.reviewerUserId && <p className="pgr-review-note">Revisão interna registrada por {record.reviewerRole === "consultoria_admin" ? "administradora" : "profissional SST"}. Isso não representa assinatura eletrônica.</p>}
        <details className="document-versions"><summary>Histórico · {record.history.length} eventos</summary><ul>{record.history.map((entry) => <li key={entry.id}><span>{entry.action === "draft" ? "Rascunho criado" : entry.action === "updated" ? "Rascunho atualizado" : entry.action === "in_review" ? "Enviado para revisão" : "Revisão interna registrada"}<small>{entry.actorRole === "consultoria_admin" ? "Administradora" : entry.actorRole} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.occurredAt))}</small></span></li>)}</ul></details>
        <button className="text-button pgr-print" type="button" onClick={(event) => { const card = event.currentTarget.closest(".pgr-card"); if (!card) return; const copy = document.createElement("div"); copy.className = "pgr-print-copy"; copy.appendChild(card.cloneNode(true)); document.body.appendChild(copy); try { window.print(); } finally { copy.remove(); } }}>Imprimir / salvar cópia</button>
      </article>;
    }) : <p className="client-empty">Nenhum rascunho de PGR foi criado.</p>}</div>
  </section>;
}
