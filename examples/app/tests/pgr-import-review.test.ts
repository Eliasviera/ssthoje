import assert from "node:assert/strict";
import test from "node:test";
import { enrichPgrProfile, type SourceProfile } from "../src/lib/pgr-profile-projection.ts";
import { reviewPgrImport } from "../src/lib/pgr-import-review.ts";

function fixture() {
  const source: SourceProfile = { schemaVersion:1,sha256:"a".repeat(64),pageCount:1,pages:[{number:1,text:"",tables:[]}],companyFields:{},roles:[{role:"Função fictícia",sector:"Setor fictício",description:"Descrição",page:1,workforceReported:["Total","2","Homens","1","Mulheres","1","Menores","1"],riskAssociations:[]}],risks:[],actionTables:[] };
  const profile=enrichPgrProfile(source);
  profile.companyFields["N° de Funcionários"]=[{value:"2",page:1}];
  return profile;
}
test("compara totais sem somar menores novamente ou confundir função com pessoas",()=>{
  const profile=fixture();
  assert.equal(reviewPgrImport(profile).totalsMatch,true);
  profile.companyFields["N° de Funcionários"][0].value="3";
  assert.equal(reviewPgrImport(profile).issues[0].code,"WORKFORCE_MISMATCH");
  profile.roles.push({...profile.roles[0],page:2});
  const review=reviewPgrImport(profile);
  assert.equal(review.totalsComparable,false);
  assert.ok(review.issues.some(issue=>issue.code==="ROLE_DUPLICATE"));
});
test("marca vazios e datas inválidas, preservando campos e a data de origem",()=>{
  const profile=fixture();
  profile.exposures.push({page:1,date:"29/02/2025",intensity:"",method:"",actionLevel:"390 ppm",limit:"",status:"reported_pending_review"});
  profile.actions.push({page:1,scope:[],fields:{"Início Previsto":"01/03/2026","Conclusão Prevista":"28/02/2026"},rows:[]});
  const before=JSON.stringify(profile);
  const codes=reviewPgrImport(profile).issues.map(issue=>issue.code);
  assert.deepEqual(codes,["EXPOSURE_FIELDS_MISSING","EXPOSURE_DATE_INVALID","ACTION_DATE_ORDER"]);
  assert.equal(JSON.stringify(profile),before);
  profile.exposures[0].date="29/02/2024";
  assert.ok(!reviewPgrImport(profile).issues.some(issue=>issue.code==="EXPOSURE_DATE_INVALID"));
});
test("não conclui comparação com total ausente e sinaliza possível corte de palavra sem corrigir",()=>{
  const profile=fixture();
  profile.roles[0].workforceReported=[];
  profile.risks.push({activity:"Atividade",hazard:"Perigo",page:1,measures:[],ppe:[],details:{sourceAndPropagationRawCells:["Produto A",null,"r, contato"]}});
  const review=reviewPgrImport(profile);
  assert.equal(review.totalsMatch,null);
  assert.equal(review.roleTotal,null);
  assert.ok(review.issues.some(issue=>issue.code==="SOURCE_CELL_BOUNDARY"));
});
