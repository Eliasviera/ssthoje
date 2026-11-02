import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAnalysisSources } from '../src/lib/third-party-analysis-sources.mjs';
const scope={tenantId:'tenant',companyId:'cliente',unitId:'unidade',contractorId:'00000000-0000-4000-8000-000000000001',scopeId:'00000000-0000-4000-8000-000000000002',scope:'serviço fictício'};
const row=id=>({...scope,id,revision:1,digest:'a'.repeat(64)});
const source=()=>({policyVersion:1,documents:[row('doc-a'),row('doc-b')],requirements:[row('req')],evaluations:[row('aval')],policies:[row('policy')]});
const pending=[{id:'pgr',level:'authorization'}];
test('mesmas fontes produzem hash estável apesar da ordem',()=>{
  const first=source(),second=source();second.documents.reverse();
  assert.equal(compileAnalysisSources(scope,first,pending).fingerprint,compileAnalysisSources(scope,second,pending).fingerprint);
});
test('mudança em cada dependência ou política invalida a impressão',()=>{
  const original=compileAnalysisSources(scope,source(),pending).fingerprint;
  for(const group of ['documents','requirements','evaluations','policies']) {
    const changed=source();changed[group][0].revision=2;
    assert.notEqual(compileAnalysisSources(scope,changed,pending).fingerprint,original);
  }
  assert.notEqual(compileAnalysisSources(scope,{...source(),policyVersion:2},pending).fingerprint,original);
  assert.notEqual(compileAnalysisSources(scope,source(),[{id:'pgr',level:'block'}]).fingerprint,original);
});
test('recusa referência cruzada, duplicidade e fonte obrigatória ausente',()=>{
  const crossed=source();crossed.documents[0].contractorId='outra';
  assert.throws(()=>compileAnalysisSources(scope,crossed,pending));
  const duplicated=source();duplicated.documents.push(duplicated.documents[0]);
  assert.throws(()=>compileAnalysisSources(scope,duplicated,pending));
  assert.throws(()=>compileAnalysisSources(scope,{...source(),policies:[]},pending));
});
test('exige UUIDs persistentes para terceira e caso, sem validar nomes como identidade',()=>{
  for(const change of [{contractorId:'00000000000009'},{contractorId:'Contratada de teste'},{scopeId:'escopo-1'}]) {
    assert.throws(()=>compileAnalysisSources({...scope,...change},source(),pending),/Identidade persistente/);
  }
});
test('saída projeta referências e não carrega conteúdo livre',()=>{
  const values=source();values.documents[0].clinicalText='não deve sair';
  const before=JSON.stringify(values);
  const compiled=compileAnalysisSources(scope,values,pending);
  assert.equal(JSON.stringify(compiled).includes('clinicalText'),false);
  assert.equal(JSON.stringify(values),before);
});
