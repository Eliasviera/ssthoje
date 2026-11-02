import test from "node:test";
import assert from "node:assert/strict";
import { createPermitChecklistCandidate, transitionPermitChecklist, openPermitNc, type PermitRole, type PermitChecklist, type PermitAnswer } from "../src/lib/work-permit-checklist-workflow.ts";
const scope = {tenantId:"tenant-a",companyId:"company-a",unitId:"unit-a",activityId:"activity-a"};
const actor = (role:PermitRole) => ({...scope,userId:`fictitious-${role}`,role});
const nc:PermitAnswer = {id:"item-a",prompt:"Item genérico de teste",result:"nc",note:"Descrição fictícia da NC"};
const submit = (hasTst=true, answers=[nc]) => transitionPermitChecklist(createPermitChecklistCandidate(scope,hasTst),actor("supervisor"),1,{action:"submit",answers});
const step = (state:PermitChecklist,role:PermitRole,command:Parameters<typeof transitionPermitChecklist>[3]) => transitionPermitChecklist(state,actor(role),state.revision,command);
test("NC com TST aguarda reavaliação, sem bypass do supervisor",()=>{
  const state=submit();
  assert.equal(state.status,"awaiting_tst");
  assert.throws(()=>step(state,"supervisor",{action:"release",note:"Tentativa"}));
  assert.throws(()=>step(state,"supervisor",{action:"continue_with_nc",note:"Tentativa"}));
  assert.throws(()=>step(state,"supervisor",{action:"review",note:"Tentativa",reviews:[{id:nc.id,verdict:"corrected",evidence:"Teste"}]}));
});
test("NC mantida pelo TST volta ao supervisor e preserva parecer ao prosseguir",()=>{
  const reviewed=step(submit(),"tst",{action:"review",note:"NC persistente",reviews:[{id:nc.id,verdict:"nc_remains",evidence:"Evidência sintética"}]});
  assert.equal(reviewed.status,"supervisor_decision");
  assert.throws(()=>step(reviewed,"tst",{action:"continue_with_nc",note:"Não autorizado"}));
  assert.throws(()=>step(reviewed,"leader",{action:"continue_with_nc",note:"A decisão de NC é do supervisor"}));
  const decided=step(reviewed,"supervisor",{action:"continue_with_nc",note:"Justificativa fictícia de assunção"});
  assert.equal(decided.status,"continuation_with_nc_recorded");
  assert.equal(openPermitNc(decided).length,1);
  assert.equal(decided.answers[0].result,"nc");
  assert.equal(decided.reviews[0].verdict,"nc_remains");
  assert.equal(decided.history[1].actorRole,"tst");
  assert.equal(decided.history[2].actorRole,"supervisor");
  assert.ok(decided.history.every(event=>!Number.isNaN(Date.parse(event.occurredAt))));
});
test("aguardar adequação não libera e relato de correção volta à reavaliação",()=>{
  let state=step(submit(),"tst",{action:"review",note:"Revisão",reviews:[{id:nc.id,verdict:"nc_remains",evidence:"Evidência"}]});
  state=step(state,"supervisor",{action:"await_correction",note:"Aguardar ação fictícia"});
  assert.equal(state.status,"awaiting_correction");
  assert.throws(()=>step(state,"supervisor",{action:"release",note:"Tentativa"}));
  state=step(state,"supervisor",{action:"resubmit_correction",note:"Adequação relatada com referência fictícia"});
  assert.equal(state.status,"awaiting_tst");
  assert.equal(openPermitNc(state).length,1);
  state=step(state,"tst",{action:"review",note:"Adequação conferida",reviews:[{id:nc.id,verdict:"corrected",evidence:"Evidência da correção"}]});
  state=step(state,"supervisor",{action:"release",note:"Decisão após adequação"});
  assert.equal(state.status,"release_recorded");
  assert.equal(openPermitNc(state).length,0);
  assert.equal(state.answers[0].result,"nc");
  assert.equal(state.history[0].answers[0].result,"nc");
  assert.equal(state.history[1].reviews[0].verdict,"nc_remains");
});
test("empresa sem TST direciona NC ao supervisor, sem simular parecer técnico",()=>{
  const state=submit(false);
  assert.equal(state.status,"supervisor_decision");
  assert.throws(()=>step(state,"tst",{action:"review",note:"Sem vínculo TST",reviews:[{id:nc.id,verdict:"corrected",evidence:"Teste"}]}));
  const decision=step(state,"supervisor",{action:"continue_with_nc",note:"Assunção fictícia sem TST"});
  assert.equal(decision.status,"continuation_with_nc_recorded");
  assert.equal(decision.history.some(event=>event.actorRole==="tst"),false);
});
test("sem TST, supervisor pode conferir adequação, mantendo a NC original",()=>{
  let state=submit(false);
  state=step(state,"supervisor",{action:"review",note:"Verificação de adequação",reviews:[{id:nc.id,verdict:"corrected",evidence:"Evidência fictícia da adequação"}]});
  state=step(state,"supervisor",{action:"release",note:"Decisão fictícia"});
  assert.equal(state.status,"release_recorded");
  assert.equal(state.answers[0].result,"nc");
});
test("sem NC líder pode registrar liberação; TST e integrantes não",()=>{
  const state=submit(true,[{...nc,result:"conforming",note:""}]);
  for(const role of ["tst","participant"] as const) assert.throws(()=>step(state,role,{action:"release",note:"Tentativa"}));
  assert.equal(step(state,"leader",{action:"release",note:"Decisão fictícia"}).status,"release_recorded");
});
test("nega escopo diferente, replay, justificativa vazia e parecer incompleto",()=>{
  const state=submit();
  assert.throws(()=>transitionPermitChecklist(state,{...actor("tst"),tenantId:"tenant-b"},state.revision,{action:"review",note:"Teste",reviews:[]}));
  assert.throws(()=>transitionPermitChecklist(state,{...actor("tst"),activityId:"activity-b"},state.revision,{action:"review",note:"Teste",reviews:[]}));
  assert.throws(()=>transitionPermitChecklist(state,actor("tst"),1,{action:"review",note:"Teste",reviews:[]}));
  assert.throws(()=>step(state,"tst",{action:"review",note:"Revisão",reviews:[]}));
  assert.throws(()=>step(state,"tst",{action:"review",note:"Revisão",reviews:[{id:nc.id,verdict:"corrected",evidence:" "}]}));
  assert.throws(()=>submit(true,[{...nc,note:""}]));
  assert.throws(()=>submit(true,[nc,nc]));
  assert.throws(()=>step(submit(false),"supervisor",{action:"continue_with_nc",note:" "}));
});
test("integrante declara participação só depois da decisão e não altera NC",()=>{
  const released=step(submit(true,[{...nc,result:"conforming",note:""}]),"leader",{action:"release",note:"Decisão fictícia"});
  assert.throws(()=>step(released,"leader",{action:"sign_participation",statement:"Tentativa do líder"}));
  assert.throws(()=>step(released,"tst",{action:"sign_participation",statement:"Tentativa do TST"}));
  const signed=transitionPermitChecklist(released,{...scope,userId:"fictitious-participant-a",role:"participant"},released.revision,{action:"sign_participation",statement:"Confirmo participação fictícia."});
  assert.equal(signed.status,"release_recorded");
  assert.equal(signed.signatures.length,1);
  assert.equal(signed.signatures[0].userId,"fictitious-participant-a");
  assert.throws(()=>transitionPermitChecklist(signed,{...scope,userId:"fictitious-participant-a",role:"participant"},signed.revision,{action:"sign_participation",statement:"Repetir"}));
  const withNc=step(submit(false),"supervisor",{action:"continue_with_nc",note:"Assunção fictícia"});
  const signedNc=transitionPermitChecklist(withNc,{...scope,userId:"fictitious-participant-b",role:"participant"},withNc.revision,{action:"sign_participation",statement:"Participação com NC aberta."});
  assert.equal(openPermitNc(signedNc).length,1);
  assert.equal(signedNc.answers[0].result,"nc");
  assert.equal(signedNc.status,"continuation_with_nc_recorded");
});
test("participação é recusada antes da decisão de campo",()=>{
  assert.throws(()=>transitionPermitChecklist(submit(),{...scope,userId:"fictitious-participant-a",role:"participant"},2,{action:"sign_participation",statement:"Cedo demais"}));
});
test("transição não muda a origem nem permite decisão terminal ser repetida",()=>{
  const state=submit(false);
  const original=structuredClone(state);
  const next=step(state,"supervisor",{action:"continue_with_nc",note:"Decisão sintética"});
  assert.deepEqual(state,original);
  next.history[0].answers[0].note="Mutação externa";
  assert.deepEqual(state,original);
  assert.throws(()=>step(next,"supervisor",{action:"continue_with_nc",note:"Repetir"}));
});
