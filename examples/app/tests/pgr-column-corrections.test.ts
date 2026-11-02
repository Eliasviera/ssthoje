import assert from "node:assert/strict";
import test from "node:test";
import { enrichPgrProfile, projectPgrInventory, type SourceProfile } from "../src/lib/pgr-profile-projection.ts";
import { applyPgrColumnCorrections, isPgrColumnCorrectionVerified, type ColumnCorrections } from "../src/lib/pgr-column-corrections.ts";
import { reviewPgrImport } from "../src/lib/pgr-import-review.ts";

function fixture() {
  const source:SourceProfile={schemaVersion:1,sha256:"a".repeat(64),pageCount:1,pages:[{number:1,text:"",tables:[]}],companyFields:{},roles:[],actionTables:[],risks:[{activity:"Atividade",hazard:"Perigo",page:1,measures:[],ppe:[],details:{sourceAndPropagationRawCells:["Produto A",null,null,"r, contato"]}}]};
  const proof:ColumnCorrections={schemaVersion:1,method:"printed-header-whole-word-v1",sha256:source.sha256,corrections:[{page:1,before:["Produto A",null,null,"r, contato"],source:"Produto",propagation:"Ar, contato",anchorX:298,boundaryX:300,crossingWords:[{text:"Ar,",x0:298,x1:308,top:20}]}]};
  return {profile:enrichPgrProfile(source),proof};
}
test("recuperação conserva origem/caracteres e muda apenas a separação do campo",()=>{
  const {profile,proof}=fixture();const before=JSON.stringify(profile);
  const corrected=applyPgrColumnCorrections(profile,proof);
  assert.equal(JSON.stringify(profile),before);
  assert.equal(isPgrColumnCorrectionVerified(corrected,corrected.risks[0]),true);
  assert.equal(reviewPgrImport(corrected).issues.filter(issue=>issue.code==="SOURCE_CELL_BOUNDARY").length,0);
  const scope={tenantId:"tenant-a",companyId:"company-a",unitId:"unit-a",documentId:"document-a"};
  const previous=projectPgrInventory(profile,scope),next=projectPgrInventory(corrected,scope);
  assert.match(next.items[0].sourceCircumstance,/Fonte geradora: Produto\nMeio de propagação: Ar, contato/);
  assert.deepEqual({...previous.items[0],sourceCircumstance:""},{...next.items[0],sourceCircumstance:""});
});
test("recusa mudança de palavras, hash, origem, coordenadas ou página repetida",()=>{
  for(const mutate of [
    (proof:ColumnCorrections)=>{proof.sha256="b".repeat(64);},
    (proof:ColumnCorrections)=>{proof.corrections[0].source="Outro produto";},
    (proof:ColumnCorrections)=>{proof.corrections[0].anchorX=250;},
    (proof:ColumnCorrections)=>{proof.corrections[0].before=["Texto divergente"];},
    (proof:ColumnCorrections)=>{proof.corrections.push(proof.corrections[0]);},
  ]){const {profile,proof}=fixture();mutate(proof);assert.throws(()=>applyPgrColumnCorrections(profile,proof));}
});
test("texto corrigido sem evidência não elimina o apontamento nem entra na projeção",()=>{
  const {profile}=fixture();profile.risks[0].details.sourceGenerator="Produto";profile.risks[0].details.propagationMedium="Ar, contato";
  assert.equal(isPgrColumnCorrectionVerified(profile,profile.risks[0]),false);
  assert.ok(reviewPgrImport(profile).issues.some(issue=>issue.code==="SOURCE_CELL_BOUNDARY"));
});
