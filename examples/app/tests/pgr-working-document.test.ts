import test from "node:test";
import assert from "node:assert/strict";
import { workingDocumentItems, emptyWorkingFields } from "../src/lib/pgr-working-document.ts";
import type { ImportedPgrProfile } from "../src/lib/pgr-digitalization-store.ts";
import type { WorkingEntry } from "../src/lib/pgr-working-store.ts";
test("prévia incorpora última revisão e inclusões sem modificar origem ou histórico", () => {
  const profile = { roles:[{role:"Função fictícia",sector:"Setor",description:"Original",page:3}], risks:[] } as unknown as ImportedPgrProfile;
  const entry = (revision:number,name:string,id="role:0"):WorkingEntry => ({id,kind:"role",fields:{...emptyWorkingFields,name,evidence:"Evidência fictícia"},revision,reason:"Teste",actorUserId:"fixture",savedAt:"2026-10-31T12:00:00Z"});
  const history=[entry(2,"Editada"),entry(1,"Anterior"),entry(1,"Nova","role:new-11111111-1111-1111-1111-111111111111")];
  const before=JSON.stringify({profile,history});
  const items=workingDocumentItems(profile,history,"role");
  assert.deepEqual(items.map(item=>item.fields.name),["Editada","Nova"]);
  assert.equal(items[0].revision,2);
  assert.equal(JSON.stringify({profile,history}),before);
  items[0].fields.name="Mudança da prévia";
  assert.equal(history[0].fields.name,"Editada");
  assert.equal(workingDocumentItems(profile,history,"risk").length,0);
});

test("ações preservam campos da fonte, incorporam revisão e validam alvos sem cruzar coleções", async () => {
  const { isWorkingTarget } = await import("../src/lib/pgr-working-document.ts");
  const profile = { roles:[], risks:[], actions:[{page:12,scope:["Unidade fictícia","Ambiente","Posto"],fields:{"Ação Recomendada:":"Controle fictício",Descrição:"Descrição da fonte",Responsável:"Responsável fictício",Prioridade:"Alta","Objetivo/Meta":"Meta fictícia","Início Previsto":"01/11/2026","Conclusão Prevista":"Não definido"}}] } as unknown as ImportedPgrProfile;
  const source=JSON.stringify(profile);
  const original=workingDocumentItems(profile,[],"action")[0];
  assert.equal(original.fields.startDate,"01/11/2026"); assert.equal(original.fields.endDate,"Não definido"); assert.equal(original.fields.responsible,"Responsável fictício");
  const history:WorkingEntry[]=[{id:"action:0",kind:"action",fields:{...original.fields,description:"Texto revisado",responsible:"Equipe fictícia"},reason:"Ajuste fictício",revision:1,actorUserId:"fixture",savedAt:"2026-10-31T12:00:00Z"}];
  assert.equal(workingDocumentItems(profile,history,"action")[0].fields.description,"Texto revisado");
  assert.equal(JSON.stringify(profile),source);
  assert.equal(isWorkingTarget(profile,"action","action:0",history),true);
  for(const id of ["action:1","action:00","action:9007199254740992","risk:0","action:new-11111111-1111-1111-1111-111111111111"]) assert.equal(isWorkingTarget(profile,"action",id,history),false);
});
