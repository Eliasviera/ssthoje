import assert from "node:assert/strict";
import test from "node:test";
import { enrichPgrProfile, projectPgrInventory, type SourceProfile } from "../src/lib/pgr-profile-projection.ts";
import { validatePgrRiskInventory } from "../src/lib/pgr-risk-inventory.ts";

test("projeção preserva fonte, vínculos explícitos e medições sem aprovar o conteúdo", () => {
  const source: SourceProfile = { schemaVersion:1, sha256:"a".repeat(64),pageCount:1,
    pages:[{number:1,text:"Identificação do Estabelecimento\nCidade: Cidade Teste UF: ZZ CEP: 00000-000\nCNPJ: 00.000.000/0000-09\nCPF: NÃO COLETAR",tables:[[["Avaliação Quantitativa"],["Data","Intensidade","Nível de Ação","Limite","Técnica"],["01/01/2026","10 unidades","20 unidades","30 unidades","Método fictício"]]]}],
    companyFields:{},roles:[{role:"Função A",sector:"Setor A",description:"Descrição",workforceReported:["Total","5"],page:1,riskAssociations:[{"Origem":"Atividade A","Perigo":"Perigo A","Probabil.":"Relatada","Severidade":"Relatada","Nível de Risco":"Relatado"}]}],
    risks:[{activity:"Atividade A",hazard:"Perigo A",page:1,measures:[{type:"EPC",description:"x".repeat(1200)}],ppe:[],details:{possibleHarm:"Dano relatado",frequency:"Diário"}}],actionTables:[] };
  const profile=enrichPgrProfile(source);
  assert.equal(profile.companyFields.Cidade[0].value,"Cidade Teste");
  assert.equal(profile.companyFields.UF[0].value,"ZZ");
  assert.equal("CPF" in profile.companyFields,false);
  const inventory=projectPgrInventory(profile,{tenantId:"tenant-test",companyId:"company-test",unitId:"unit-test",documentId:"document-test"});
  assert.equal("error" in validatePgrRiskInventory(inventory),false);
  assert.equal(inventory.items[0].assessment.status,"reported");
  assert.deepEqual(inventory.items[0].exposedGroups,["Função A"]);
  assert.equal(inventory.items[0].existingMeasures.join("").replace("EPC: ","").length,1200);
  assert.match(inventory.items[0].exposureDescription,/10 unidades/);
  assert.equal(inventory.items[0].exposureEvaluations,undefined);
  source.pages[0].tables[0].push(["01/01/2026","","390 ppm","",""]);
  const incomplete=enrichPgrProfile(source).exposures[1];
  assert.equal(incomplete.intensity,"");
  assert.equal(incomplete.actionLevel,"390 ppm");
  assert.equal(incomplete.method,"");
  assert.deepEqual(projectPgrInventory(profile,{tenantId:"tenant-test",companyId:"company-test",unitId:"unit-test",documentId:"document-test"}),inventory);
  profile.roles[0].riskAssociations[0].Origem="Outra atividade";
  assert.deepEqual(projectPgrInventory(profile,{tenantId:"tenant-test",companyId:"company-test",unitId:"unit-test",documentId:"document-test"}).items[0].exposedGroups,[]);
});
