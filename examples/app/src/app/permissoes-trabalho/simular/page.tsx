import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { hasTenantPermission } from "@/lib/tenant-access";
import { listClientCompanies } from "@/lib/client-service";
import { listSafetyAprs } from "@/lib/safety-operations-store";
import { listWorkersForTenant } from "@/lib/worker-store";
import { openPermitNc } from "@/lib/work-permit-checklist-workflow";
import {
  decodeSimulation, GENERIC_ITEM_PROMPT, isDemoActivityCompatible, isDemoAprCompatible, isDemoWorkerInScope, PARTICIPANT_IDS, STATUS_LABELS,
} from "@/lib/work-permit-simulation-state";
import { simulatePermitAction } from "./actions";

export default function Page({ searchParams }: { searchParams: Promise<{ s?: string; erro?: string; apr?: string }> }) {
  return <Suspense fallback={<main className="auth-loading">Abrindo simulação…</main>}><Content searchParams={searchParams}/></Suspense>;
}

function HiddenState({ encoded }: { encoded: string }) {
  return <input type="hidden" name="state" value={encoded}/>;
}
function ActionForm({ encoded, intent, children, label, primary = false }: { encoded: string; intent: string; children?: ReactNode; label: string; primary?: boolean }) {
  return <form action={simulatePermitAction} className="pgr-form">
    <HiddenState encoded={encoded}/><input type="hidden" name="intent" value={intent}/>
    {children}
    <div className="pgr-form-footer"><button className={primary ? "primary-button" : "secondary-button"}>{label}</button></div>
  </form>;
}

async function Content({ searchParams }: { searchParams: Promise<{ s?: string; erro?: string; apr?: string }> }) {
  await connection();
  const access = await getCurrentTenantAccess("pgr.manage");
  if (!access.authenticated) redirect("/login");
  if (!access.context) redirect("/sem-acesso");
  const query = await searchParams;
  const { tenant, membership } = access.context;
  const companies = await listClientCompanies(tenant.id);
  const canReadWorkers = hasTenantPermission(membership.role, "workers.read");
  const workers = canReadWorkers ? listWorkersForTenant(tenant.id) : [];
  const aprs = listSafetyAprs(tenant.id);
  const activeCompanies = companies.filter(company => company.status === "active");
  const eligibleAprs = aprs.filter(apr => isDemoAprCompatible(apr, {
    tenantId: tenant.id,
    companyId: apr.companyId,
    unitId: apr.unitId,
  })
    && activeCompanies.some(company => company.id === apr.companyId && company.units.some(unit => unit.id === apr.unitId)));
  const selectedApr = eligibleAprs.find(apr => apr.id === query.apr);
  const selectedCompany = selectedApr && activeCompanies.find(company => company.id === selectedApr.companyId);
  const selectedUnit = selectedCompany && selectedApr?.unitId
    ? selectedCompany.units.find(unit => unit.id === selectedApr.unitId)
    : undefined;
  const simulation = query.s ? decodeSimulation(query.s) : null;
  const checklist = simulation?.checklist ?? null;
  const encoded = simulation && query.s ? query.s : "";
  const error = query.erro?.trim() || (query.s && !simulation ? "O link da simulação está inválido ou desatualizado. Inicie um novo cenário." : "");
  const simulationApr = simulation && eligibleAprs.find(apr => isDemoAprCompatible(apr, {
    tenantId: simulation.scenario.tenantId,
    companyId: simulation.scenario.companyId,
    unitId: simulation.scenario.unitId,
    aprId: simulation.scenario.aprId,
    revision: simulation.scenario.aprRevision,
  }));
  const simulationCompany = simulationApr && activeCompanies.find(company =>
    company.id === simulationApr.companyId && company.id === simulation.scenario.companyId,
  );
  const simulationUnit = simulation && simulationApr && simulationCompany?.units.find(unit =>
    unit.id === simulationApr.unitId && unit.id === simulation.scenario.unitId,
  );
  const simulationWorker = simulation && workers.find(worker =>
    worker.id === simulation.scenario.supervisorWorkerId && isDemoWorkerInScope(worker, simulation.scenario),
  );
  const simulationScaffoldWorkers = simulation?.scenario.activity.scaffoldAssemblerWorkerIds
    .map(workerId => workers.find(worker => worker.id === workerId && isDemoWorkerInScope(worker, simulation.scenario)))
    .filter((worker): worker is NonNullable<typeof worker> => !!worker) ?? [];
  const simulationScaffoldWorkersValid = !!simulation
    && simulationScaffoldWorkers.length === simulation.scenario.activity.scaffoldAssemblerWorkerIds.length;
  const simulationActivityValid = simulation && simulationApr && isDemoActivityCompatible(simulation.scenario.activity, {
    tenantId: simulationApr.tenantId,
    aprId: simulationApr.id,
    aprRevision: simulationApr.revision,
    companyId: simulationApr.companyId,
    unitId: simulationApr.unitId,
    activityStage: simulationApr.activityStage,
    workArea: simulationApr.workArea,
    scaffoldUseStatus: simulation.scenario.activity.scaffoldUseStatus,
    scaffoldAssemblyStatus: simulation.scenario.activity.scaffoldAssemblyStatus,
    scaffoldAssemblerWorkerIds: simulation.scenario.activity.scaffoldAssemblerWorkerIds,
  });
  const simulationScopeValid = !!simulation && simulation.scenario.tenantId === tenant.id && !!simulationApr
    && !!simulationCompany && !!simulationUnit && !!simulationWorker && !!simulationScaffoldWorkersValid && !!simulationActivityValid;
  const scopedWorkers = selectedCompany && selectedUnit
    ? workers.filter(worker => isDemoWorkerInScope(worker, { tenantId: tenant.id, companyId: selectedCompany.id, unitId: selectedUnit.id }))
    : [];
  const openNc = checklist ? openPermitNc(checklist).length : 0;
  return <main className="main-area" style={{ marginLeft: 0 }}>
    <header className="topbar">
      <Link className="secondary-button" href="/permissoes-trabalho">Voltar à preparação</Link>
      <form action={simulatePermitAction}><input type="hidden" name="intent" value="reset"/><button className="secondary-button">Reiniciar simulação</button></form>
    </header>
    <div className="content-wrap">
      <section className="welcome-row"><div>
        <p className="eyebrow">{tenant.name} · DEMONSTRAÇÃO</p>
        <h1>Simulação · trabalho em altura</h1>
        <p className="page-description">Ensaio do fluxo de NC, reavaliação e assinatura de participação. Sem efeito operacional.</p>
      </div></section>
      <section className="panel pgr-section" aria-label="Simulação de checklist">
        <div className="document-warning">
          <strong>Documento demonstrativo.</strong> A conta autenticada apenas opera o ensaio; os atores são fictícios e fixos.
          Nada é gravado em banco, PDF ou relatório de NC. Recarregar a mesma URL mantém o permalink; abrir sem parâmetro ou reiniciar descarta o cenário.
          O item abaixo não é checklist técnico de altura e não libera trabalho.
        </div>
        {error && <p className="client-form-message client-form-error" role="alert">{error}</p>}
        {!simulation && !selectedApr && <form action={simulatePermitAction} className="pgr-form">
          <input type="hidden" name="intent" value="choose_apr"/>
          <label className="form-field pgr-wide">APR existente da atividade<select name="aprId" required defaultValue="">
            <option value="" disabled>Selecione uma APR</option>
            {eligibleAprs.map(apr => {
              const company = activeCompanies.find(entry => entry.id === apr.companyId);
              const unit = company?.units.find(entry => entry.id === apr.unitId);
              return <option key={apr.id} value={apr.id}>{apr.title} · {company?.tradeName || company?.legalName} · {unit?.name} · {apr.status === "draft" ? "Rascunho" : "Em revisão"} · revisão {apr.revision}</option>;
            })}
          </select></label>
          {!eligibleAprs.length && <div className="permission-note">
            <p>Não há APR elegível para o ensaio. Ele aceita uma APR existente em rascunho ou em revisão, vinculada a uma empresa e unidade ativas; esta tela não cria APR nem aceita cenário sem vínculo.</p>
            <p>Para criar uma APR, primeiro configure um modelo de checklist revisado pela equipe e selecione um PGR aprovado com riscos estruturados.</p>
            <p><Link href="/?section=pgr">Consultar PGR</Link> · <Link href="/#safety-apr">Configurar checklist e APR</Link></p>
          </div>}
          <div className="pgr-form-footer"><p>A seleção só vincula o cenário demonstrativo à revisão atual da APR; não significa aprovação técnica ou liberação.</p><button className="primary-button" disabled={!eligibleAprs.length}>Vincular APR</button></div>
        </form>}
        {!simulation && selectedApr && selectedCompany && selectedUnit && <>
          <article className="pgr-card">
            <h2>APR vinculada ao cenário</h2>
            <p>Atividade demonstrativa de trabalho em altura · critérios técnicos pendentes de revisão humana.</p>
            <p>{selectedApr.title} · revisão {selectedApr.revision} · {selectedApr.status === "draft" ? "Rascunho" : "Em revisão"}</p>
            <p>{selectedApr.activityStage} · {selectedApr.workArea}</p>
            <p>Etapa e área são contexto copiado da APR, não critérios técnicos avaliados pelo simulador.</p>
            <p>{selectedCompany.tradeName || selectedCompany.legalName} · {selectedUnit.name}</p>
            <p>O estado da APR não representa aprovação técnica nem liberação. O simulador não copia nem avalia os riscos/respostas da APR.</p>
            <form action={simulatePermitAction} className="pgr-form">
              <input type="hidden" name="intent" value="start"/>
              <input type="hidden" name="aprId" value={selectedApr.id}/>
              <input type="hidden" name="aprRevision" value={selectedApr.revision}/>
              <label className="form-field pgr-wide">Funcionário fictício selecionado como supervisor do cenário<select name="supervisorWorkerId" required defaultValue="">
                <option value="" disabled>Selecione explicitamente</option>
                {scopedWorkers.map(worker => {
                  const nr35 = worker.nr35TrainingStatus === "reported_pending_validation" ? "NR-35 informada, pendente de validação" : "NR-35 não informada";
                  const supervision = worker.heightWorkSupervisionTrainingStatus === "reported_pending_validation" ? "supervisão informada, pendente de validação" : "supervisão não informada";
                  return <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.jobTitle} · {nr35} · {supervision}</option>;
                })}
              </select></label>
              <p className="permission-note">O estado dos dois treinamentos é exibido separadamente para apoiar a escolha explícita; nenhum está verificado pelo sistema, e a preferência não filtra nem pré-seleciona funcionários.</p>
              <label className="form-field">Uso de andaime nesta atividade<select name="scaffoldUseStatus" required defaultValue="">
                <option value="" disabled>Informe o cenário</option>
                <option value="not_informed">Ainda não informado</option>
                <option value="used">Sim, será utilizado</option>
                <option value="not_used">Não será utilizado</option>
              </select></label>
              <p className="permission-note">O uso é registrado separadamente. O campo de treinamento para montagem/desmontagem no cadastro é apenas relato pendente de validação e não identifica quem executará a montagem.</p>
              <label className="form-field">A atividade inclui montagem/desmontagem de andaime?<select name="scaffoldAssemblyStatus" required defaultValue="">
                <option value="" disabled>Informe o escopo</option>
                <option value="not_informed">Ainda não informado</option>
                <option value="included">Sim, inclui montagem/desmontagem</option>
                <option value="not_included">Não inclui montagem/desmontagem</option>
              </select></label>
              <p className="permission-note">Base normativa: <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-18-nr-18">NR-18, item 18.12.6, texto vigente publicado pelo MTE</a>: montagem/desmontagem deve ser realizada por trabalhadores capacitados com treinamento específico para o tipo de andaime. A simulação não verifica treinamento nem bloqueia/libera a atividade.</p>
              <label className="form-field pgr-wide">Trabalhadores fictícios designados à montagem/desmontagem<select name="scaffoldAssemblerWorkerId" multiple size={Math.min(Math.max(scopedWorkers.length, 3), 6)}>
                {scopedWorkers.map(worker => {
                  const training = worker.scaffoldingAssemblyTrainingStatus === "reported_pending_validation"
                    ? "treinamento informado · pendente de validação"
                    : "treinamento não informado";
                  return <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.jobTitle} · {training}</option>;
                })}
              </select></label>
              <p className="permission-note">Selecione trabalhadores somente quando a atividade incluir montagem/desmontagem. Nesse caso, informe todos os designados. A revisão futura pelo supervisor responsável deverá considerar o registro do treinamento e a confirmação do empregador. Esta simulação não autentica a revisão, não recebe nem armazena documentos e não confirma qualificação.</p>
              <label className="form-field">TST no cenário<select name="hasTst" required defaultValue="yes">
                <option value="yes">Empresa com TST disponível</option>
                <option value="no">Empresa sem TST</option>
              </select></label>
              <div className="pgr-form-footer"><p>Os treinamentos são informações demonstrativas pendentes de validação. A escolha não autentica nem concede autoridade.</p><button className="primary-button" disabled={!scopedWorkers.length}>Iniciar cenário</button></div>
            </form>
            {!canReadWorkers && <p className="permission-note">Seu perfil não tem permissão para consultar funcionários; solicite acesso autorizado para continuar.</p>}
            {canReadWorkers && !scopedWorkers.length && <p className="permission-note">Nenhum funcionário ativo está vinculado a esta unidade. Cadastre ou selecione outra unidade; não será escolhido um supervisor automaticamente.</p>}
          </article>
          <Link className="secondary-button" href="/permissoes-trabalho/simular">Trocar APR</Link>
        </>}
        {simulation && !simulationScopeValid && <div className="document-warning" role="alert">A APR, a descrição contextual da atividade ou o funcionário/escopo não corresponde mais ao vínculo ativo. Nenhuma ação do ensaio pode ser registrada; reinicie e escolha a revisão atual.</div>}
        {simulation && checklist && simulationScopeValid && <>
          <article className="pgr-card">
            <h2>APR vinculada ao cenário demonstrativo</h2>
            <p>Atividade demo: trabalho em altura · critérios técnicos pendentes de revisão humana.</p>
            <p>{simulationApr?.title} · revisão {simulationApr?.revision} · {simulationApr?.status === "draft" ? "Rascunho" : "Em revisão"}</p>
            <p>{simulation.scenario.activity.activityStage} · {simulation.scenario.activity.workArea}</p>
            <p>Etapa e área são contexto copiado da APR, não critérios técnicos avaliados pelo simulador.</p>
            <p>Uso de andaime na atividade: {simulation.scenario.activity.scaffoldUseStatus === "used" ? "sim" : simulation.scenario.activity.scaffoldUseStatus === "not_used" ? "não" : "não informado"}.</p>
            <p>Montagem/desmontagem no escopo: {simulation.scenario.activity.scaffoldAssemblyStatus === "included" ? "sim" : simulation.scenario.activity.scaffoldAssemblyStatus === "not_included" ? "não" : "não informado"}.</p>
            {simulationScaffoldWorkers.length > 0 && <div><strong>Trabalhadores fictícios designados à montagem/desmontagem:</strong><ul>{simulationScaffoldWorkers.map(worker => <li key={worker.id}>{worker.displayName} · {worker.jobTitle} · treinamento para montagem/desmontagem: {worker.scaffoldingAssemblyTrainingStatus === "reported_pending_validation" ? "informado · pendente de validação" : "não informado"}</li>)}</ul></div>}
            <p>O status é apenas demonstrativo: não comprova qualificação. A validação humana futura cabe ao supervisor responsável pela atividade e considera registro do treinamento mais confirmação do empregador. Esta simulação não autentica essa revisão, não recebe nem armazena documentos e não bloqueia/libera a atividade.</p>
            <p>{simulationCompany?.tradeName || simulationCompany?.legalName} · {simulationUnit?.name}</p>
            <p>Supervisor indicado para o cenário: {simulationWorker?.displayName} · {simulationWorker?.jobTitle}. Esta referência não prova treinamento, autoridade ou identidade de operador.</p>
            <p>A APR é mostrada como contexto; o simulador não usa suas respostas ou riscos para avaliar nem liberar a atividade.</p>
          </article>
          <article className="pgr-card">
            <header><div><h2>Estado atual</h2><p>{GENERIC_ITEM_PROMPT}</p></div><span className="period-label">{STATUS_LABELS[checklist.status]}</span></header>
            <p>Revisão {checklist.revision} · TST no cenário: {checklist.hasTst ? "disponível" : "ausente"} · NC aberta: {openNc ? "sim" : "não"}</p>
            {checklist.answers[0] && <p><strong>Resultado informado:</strong> {checklist.answers[0].result} · {checklist.answers[0].note || "sem nota"}</p>}
            {checklist.reviews[0] && <p><strong>Última reavaliação:</strong> {checklist.reviews[0].verdict} · {checklist.reviews[0].evidence}</p>}
            <p><strong>Participações registradas:</strong> {checklist.signatures.length}</p>
            {checklist.signatures.length > 0 && <ul>{checklist.signatures.map(signature => <li key={signature.userId}>{signature.userId}: {signature.statement}</li>)}</ul>}
          </article>
          {checklist.status === "draft" && <>
            <h2>Preenchimento pelo líder ou supervisor</h2>
            <ActionForm encoded={encoded} intent="submit_supervisor" label="Enviar como supervisor" primary>
              <label className="form-field">Resultado do item<select name="result" required defaultValue="nc">
                <option value="nc">Não conformidade</option>
                <option value="conforming">Conforme neste ensaio</option>
                <option value="not_applicable">Não aplicável</option>
              </select></label>
              <label className="form-field pgr-wide">Descrição fictícia<textarea name="note" maxLength={2000} rows={3} placeholder="Obrigatória para NC ou não aplicável"/></label>
            </ActionForm>
            <ActionForm encoded={encoded} intent="submit_leader" label="Enviar como líder">
              <input type="hidden" name="result" value="conforming"/><input type="hidden" name="note" value=""/>
              <p>Atalho do roteiro: envio sem NC, para testar que integrante e TST não liberam.</p>
            </ActionForm>
          </>}
          {checklist.status === "awaiting_tst" && <>
            <h2>Reavaliação do TST</h2>
            <p>O supervisor não decide nesta etapa.</p>
            <ActionForm encoded={encoded} intent="review_tst" label="Registrar reavaliação do TST" primary>
              <label className="form-field">Conclusão<select name="verdict" required defaultValue="nc_remains">
                <option value="nc_remains">NC permanece</option>
                <option value="corrected">Considerada corrigida nesta reavaliação</option>
              </select></label>
              <label className="form-field pgr-wide">Evidência fictícia<textarea name="evidence" required maxLength={2000} rows={3}/></label>
              <label className="form-field pgr-wide">Nota da reavaliação<textarea name="note" required maxLength={2000} rows={2}/></label>
            </ActionForm>
          </>}
          {checklist.status === "supervisor_decision" && <>
            <h2>Decisão de campo</h2>
            {openNc > 0 && <>
              {!checklist.hasTst && <ActionForm encoded={encoded} intent="review_supervisor" label="Conferir adequação sem TST">
                <label className="form-field">Conclusão<select name="verdict" required defaultValue="corrected">
                  <option value="corrected">Adequação conferida pelo supervisor</option>
                  <option value="nc_remains">NC permanece</option>
                </select></label>
                <label className="form-field pgr-wide">Evidência fictícia<textarea name="evidence" required maxLength={2000} rows={3}/></label>
                <label className="form-field pgr-wide">Nota<textarea name="note" required maxLength={2000} rows={2}/></label>
              </ActionForm>}
              <ActionForm encoded={encoded} intent="await_correction" label="Aguardar adequação">
                <label className="form-field pgr-wide">Justificativa<textarea name="note" required maxLength={2000} rows={2}/></label>
              </ActionForm>
              <ActionForm encoded={encoded} intent="continue_with_nc" label="Registrar decisão de prosseguir com NC" primary>
                <label className="form-field pgr-wide">Justificativa da assunção<textarea name="note" required maxLength={2000} rows={3}/></label>
                <p>A NC permanece aberta. Isso não vira conformidade.</p>
              </ActionForm>
            </>}
            {openNc === 0 && <>
              <ActionForm encoded={encoded} intent="release_supervisor" label="Registrar liberação como supervisor" primary>
                <label className="form-field pgr-wide">Nota da decisão<textarea name="note" required maxLength={2000} rows={2}/></label>
              </ActionForm>
              <ActionForm encoded={encoded} intent="release_leader" label="Registrar liberação como líder">
                <label className="form-field pgr-wide">Nota da decisão<textarea name="note" required maxLength={2000} rows={2}/></label>
              </ActionForm>
            </>}
          </>}
          {checklist.status === "awaiting_correction" && <ActionForm encoded={encoded} intent="resubmit_correction" label="Relatar adequação" primary>
            <label className="form-field pgr-wide">Relato fictício da adequação<textarea name="note" required maxLength={2000} rows={3}/></label>
            <p>Relatar adequação não remove a NC. Com TST, volta à reavaliação.</p>
          </ActionForm>}
          {(checklist.status === "release_recorded" || checklist.status === "continuation_with_nc_recorded") && <>
            <h2>Assinatura de participação</h2>
            <p>Somente integrante fictício registra a própria participação. Não concede liberação e não altera NC.</p>
            <ActionForm encoded={encoded} intent="sign_participation" label="Registrar participação" primary>
              <label className="form-field">Integrante<select name="participantId" required>{PARTICIPANT_IDS.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
              <label className="form-field pgr-wide">Declaração<textarea name="statement" required maxLength={500} rows={3} defaultValue="Confirmo minha participação nesta atividade fictícia. Esta declaração não libera o trabalho."/></label>
            </ActionForm>
          </>}
          <details open><summary>Histórico da simulação · {checklist.history.length}</summary>
            <ol>{checklist.history.map(event => <li key={event.revision}>
              <strong>{event.action}</strong> · {event.actorRole} ({event.actorUserId}) · revisão {event.revision}
              <p>{event.note}</p>
            </li>)}</ol>
          </details>
        </>}
      </section>
    </div>
  </main>;
}
