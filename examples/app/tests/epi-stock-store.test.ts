import assert from "node:assert/strict";
import test,{before,after} from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createEpiStockItem,moveEpiStock,listEpiStock,epiStockBalance,getEpiDeliveryStockReconciliation,reviewEpiStockCa,saveEpiStockDocumentPdf,readEpiInvoicePdf} from "../src/lib/epi-stock-store.ts";
import {listAuditEventsForTenant} from "../src/lib/audit-log.ts";
import {readPlatformState,writePlatformState} from "../src/lib/tenant-state.ts";
import {DEFAULT_PLAN} from "../src/lib/plan-catalog.ts";
const original=process.cwd();let temporary="";
before(()=>{temporary=mkdtempSync(join(tmpdir(),"sst-epi-stock-test-"));process.chdir(temporary);});
after(()=>{process.chdir(original);if(temporary)rmSync(temporary,{recursive:true,force:true});});
const admin="sst-demo-user",other="sst-demo-user-b",reader="sst-demo-sst";
const day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const fixture=(code:string,caValidUntil=day(30))=>({companyId:"company-test",unitId:"unit-test",code,name:"EPI sintético",reference:"REFERENCIA-FICTICIA",size:"Modelo fictício",storageLocation:"Depósito de teste",ca:"32546",caValidUntil,caCheckedOn:day(0),officialDescription:"Descrição fictícia de teste",approvedProtection:"Proteção fictícia de teste"});
function entry(itemId:string,revision:number,quantity:number,productValidUntil=day(365),caCheckedValidUntil=day(30),caManualChecked=true,caCheckedOn=day(0)) {
  return moveEpiStock(admin,itemId,revision,"entry",quantity,"Entrada fictícia de teste",{type:"other",reference:"ENTRADA-TESTE",receivedBy:admin,batchCode:"LOTE-TESTE",productValidUntil,unitCostCents:1000,caManualChecked,caCheckedOn,caCheckedValidUntil});
}
function exit(itemId:string,revision:number,quantity:number,productValidUntil=day(365),confirmation:{caExpiredExitConfirmed?:boolean;caExpiredExitJustification?:string}={},caCheckedValidUntil=day(30),caManualChecked=true,caCheckedOn=day(0),deliveryReference="FICHA-TESTE",deliveryQuantity=1000) {
  return moveEpiStock(admin,itemId,revision,"exit",quantity,"Saída fictícia de teste",{batchCode:"LOTE-TESTE",productValidUntil,workerName:"Trabalhador fictício",deliveryReference,deliveryQuantity,caManualChecked,caCheckedOn,caCheckedValidUntil,...confirmation});
}
test("RBAC e tenant: leitor não movimenta e outra consultoria não vê nem altera o item",()=>{
  const item=createEpiStockItem(admin,fixture("auth"));
  assert.equal(listEpiStock(reader).some(i=>i.id===item.id),true);
  assert.equal(listEpiStock(other).length,0);
  assert.throws(()=>createEpiStockItem(reader,fixture("forbidden")));
  assert.throws(()=>moveEpiStock(reader,item.id,1,"entry",1,"Tentativa"));
  assert.throws(()=>moveEpiStock(other,item.id,1,"entry",1,"Tentativa"));
  assert.throws(()=>listEpiStock("unknown-account"));
  assert.equal(epiStockBalance(listEpiStock(admin).find(i=>i.id===item.id)!),0);
});
test("saldo nunca negativo e revisão antiga impede débito duplicado",()=>{
  const item=createEpiStockItem(admin,fixture("saldo"));
  assert.throws(()=>exit(item.id,1,1));
  const entered=entry(item.id,1,10);
  assert.equal(epiStockBalance(entered),10);
  assert.equal(entered.movements.at(-1)?.caManualChecked,true);
  assert.equal(entered.movements.at(-1)?.caCheckedValidUntil,day(30));
  const exited=exit(item.id,2,7);
  assert.equal(epiStockBalance(exited),3);
  assert.equal(exited.movements.at(-1)?.caExpiredExitConfirmed,undefined);
  assert.throws(()=>exit(item.id,2,7));
  assert.throws(()=>exit(item.id,3,4));
  assert.equal(epiStockBalance(listEpiStock(admin).find(i=>i.id===item.id)!),3);
});
test("correção compensatória preserva movimentos e conta responsável",()=>{
  const item=createEpiStockItem(admin,fixture("history"));
  entry(item.id,1,8);
  exit(item.id,2,2);
  const corrected=entry(item.id,3,2);
  assert.equal(epiStockBalance(corrected),8);
  assert.deepEqual(corrected.movements.map(m=>m.quantity),[8,2,2]);
  assert.equal(corrected.movements.every(m=>m.actorUserId===admin),true);
  corrected.movements[0].quantity=900;
  assert.equal(epiStockBalance(listEpiStock(admin).find(i=>i.id===item.id)!),8);
});
test("código único no escopo, entradas inválidas e teto de saldo",()=>{
  const item=createEpiStockItem(admin,fixture(" unique "));
  assert.equal(item.code,"UNIQUE");
  assert.throws(()=>createEpiStockItem(admin,fixture("unique")));
  createEpiStockItem(admin,{...fixture("unique"),unitId:"another-unit"});
  for(const quantity of [0,-1,0.5,NaN,Infinity,1000001]) assert.throws(()=>entry(item.id,1,quantity));
  assert.throws(()=>moveEpiStock(admin,item.id,1,"entry",1," "));
  assert.throws(()=>createEpiStockItem(admin,{...fixture("long"),name:"x".repeat(121)}));
  entry(item.id,1,1000000);
  assert.throws(()=>entry(item.id,2,1));
});
test("CA vencido exige confirmação justificada de gestor e preserva o registro",t=>{
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-29T12:00:00.000Z")});
  const item=createEpiStockItem(admin,fixture("ca-expira","2026-10-30"));
  entry(item.id,1,2,"2027-10-29","2026-10-30");
  t.mock.timers.setTime(new Date("2026-10-31T12:00:00.000Z").getTime());
  assert.throws(()=>exit(item.id,2,1,"2027-10-29",{},"2026-10-30"),/CA informado está vencido/i);
  assert.throws(()=>exit(item.id,2,1,"2027-10-29",{caExpiredExitConfirmed:true}, "2026-10-30"),/Informe justificativa/i);
  const confirmed=exit(item.id,2,1,"2027-10-29",{caExpiredExitConfirmed:true,caExpiredExitJustification:"Gestor fictício registrou a decisão para revisão."},"2026-10-30");
  const movement=confirmed.movements.at(-1);
  assert.equal(movement?.caManualChecked,true);
  assert.equal(movement?.caCheckedValidUntil,"2026-10-30");
  assert.equal(movement?.caExpiredExitConfirmed,true);
  assert.equal(movement?.caExpiredExitJustification,"Gestor fictício registrou a decisão para revisão.");
  assert.equal(movement?.actorUserId,admin);
  assert.equal(movement?.occurredAt,"2026-10-31T12:00:00.000Z");
});
test("entrada e saída exigem registro de consulta manual do CAEPI",()=>{
  const item=createEpiStockItem(admin,fixture("ca-manual"));
  assert.throws(()=>entry(item.id,1,1,day(365),day(30),false),/consultou manualmente/i);
  const entered=entry(item.id,1,1);
  assert.throws(()=>exit(item.id,2,1,day(365),{},day(30),false),/consultou manualmente/i);
  assert.equal(epiStockBalance(entered),1);
});
test("entrada direta não exige anexo e relatório de almoxarifado exige PDF associado",()=>{
  const direct=createEpiStockItem(admin,fixture("direct-system"));
  const directEntry=moveEpiStock(admin,direct.id,1,"entry",2,"Entrada manual de teste",{type:"direct_system",reference:"REGISTRO-INTERNO-01",receivedBy:admin,batchCode:"LOTE-DIRETO",productValidUntil:day(365),unitCostCents:1000,caManualChecked:true,caCheckedOn:day(0),caCheckedValidUntil:day(30)});
  assert.equal(directEntry.movements[0].sourceType,"direct_system");
  assert.equal(directEntry.movements[0].sourceDocumentFileId,undefined);

  const report=createEpiStockItem(admin,fixture("warehouse-report"));
  const reportInput={type:"warehouse_report",reference:"REL-ALMOX-01",receivedBy:admin,batchCode:"LOTE-RELATORIO",productValidUntil:day(365),unitCostCents:1000,caManualChecked:true,caCheckedOn:day(0),caCheckedValidUntil:day(30)};
  assert.throws(()=>moveEpiStock(admin,report.id,1,"entry",2,"Entrada por relatório de teste",reportInput),/Anexe o relatório.*PDF/i);
  const attached=moveEpiStock(admin,report.id,1,"entry",2,"Entrada por relatório de teste",{...reportInput,sourceDocumentFileId:"00000000-0000-4000-8000-000000000001",sourceDocumentFileName:"relatorio-teste.pdf"});
  assert.equal(attached.movements[0].sourceType,"warehouse_report");
  assert.equal(attached.movements[0].sourceDocumentFileName,"relatorio-teste.pdf");
});
test("PDF da entrada fica vinculado ao movimento e só pode ser lido no tenant",async()=>{
  const item=createEpiStockItem(admin,fixture("source-document"));
  const pdf=Buffer.from("%PDF-1.7\nconteúdo sintético");
  const attachment=await saveEpiStockDocumentPdf(new File([pdf],"relatorio-almox.pdf",{type:"application/pdf"}));
  const saved=moveEpiStock(admin,item.id,1,"entry",1,"Entrada documentada de teste",{type:"warehouse_report",reference:"REL-TESTE",receivedBy:admin,batchCode:"LOTE-TESTE",productValidUntil:day(365),unitCostCents:1000,caManualChecked:true,caCheckedOn:day(0),caCheckedValidUntil:day(30),sourceDocumentFileId:attachment.id,sourceDocumentFileName:attachment.fileName});
  const movement=saved.movements[0];
  assert.deepEqual(readEpiInvoicePdf(admin,item.id,movement.id)?.bytes,pdf);
  assert.equal(readEpiInvoicePdf(admin,item.id,movement.id)?.fileName,"relatorio-almox.pdf");
  assert.equal(readEpiInvoicePdf(other,item.id,movement.id),null);
});
test("consulta do CA com mais de 15 dias bloqueia cadastro e movimentação",()=>{
  assert.throws(()=>createEpiStockItem(admin,{...fixture("ca-stale-registration"),caCheckedOn:day(-16)}),/últimos 15 dias/i);
  const item=createEpiStockItem(admin,fixture("ca-stale-movement"));
  assert.throws(()=>entry(item.id,1,1,day(365),day(30),true,day(-16)),/mais de 15 dias/i);
  assert.equal(epiStockBalance(listEpiStock(admin).find(record=>record.id===item.id)!),0);
});
test("revisão manual do ciclo atualiza CA sem movimentar saldo e preserva histórico e auditoria",()=>{
  const item=createEpiStockItem(admin,fixture("ca-cycle",day(30)));
  assert.throws(()=>reviewEpiStockCa(reader,item.id,{ca:"32546",checkedOn:day(0),validUntil:day(45)}));
  assert.throws(()=>reviewEpiStockCa(other,item.id,{ca:"32546",checkedOn:day(0),validUntil:day(45)}));
  assert.throws(()=>reviewEpiStockCa(admin,item.id,{ca:"11111",checkedOn:day(0),validUntil:day(45)}),/corresponder/i);
  assert.throws(()=>reviewEpiStockCa(admin,item.id,{ca:"32546",checkedOn:day(-16),validUntil:day(45)}),/últimos 15 dias/i);
  assert.throws(()=>reviewEpiStockCa(admin,item.id,{ca:"32546",checkedOn:day(1),validUntil:day(45)}),/últimos 15 dias/i);
  const reviewed=reviewEpiStockCa(admin,item.id,{ca:"32546",checkedOn:day(0),validUntil:day(45)});
  assert.equal(reviewed.caCheckedOn,day(0));
  assert.equal(reviewed.caValidUntil,day(45));
  assert.equal(reviewed.movements.length,0);
  assert.equal(reviewed.caCheckHistory?.length,2);
  assert.equal(reviewed.caCheckHistory?.at(-1)?.source,"manual_cycle_review");
  assert.equal(reviewed.caCheckHistory?.at(-1)?.previousValidUntil,day(30));
  assert.equal(reviewed.caCheckHistory?.at(-1)?.previousCheckedOn,day(0));
  assert.equal(listAuditEventsForTenant("tenant-horizonte").some(event=>event.action==="epi.stock_ca_reviewed"&&event.targetId===item.id),true);
});
test("atualização da validade do CA mantém a versão anterior e a conciliação soma itens equivalentes",()=>{
  const first=createEpiStockItem(admin,{...fixture("equiv-first",day(10)),caCheckedOn:day(-1)});
  const second=createEpiStockItem(admin,{...fixture("equiv-second",day(10)),caCheckedOn:day(-1)});
  const firstEntry=entry(first.id,1,3,day(365),day(40));
  assert.equal(firstEntry.caValidUntil,day(40));
  assert.equal(firstEntry.caCheckedOn,day(0));
  assert.equal(firstEntry.movements[0].caPreviousValidUntil,day(10));
  assert.equal(firstEntry.movements[0].caPreviousCheckedOn,day(-1));
  entry(second.id,1,4,day(365),day(40));
  exit(first.id,2,2,day(365),{},day(30),true,day(0),"FICHA-EQUIV",3);
  exit(second.id,2,1,day(365),{},day(30),true,day(0),"FICHA-EQUIV",3);
  const delivery={id:"FICHA-EQUIV",tenantId:"tenant-horizonte",companyId:"company-test",unitId:"unit-test",items:[{ca:"32546",size:"Modelo fictício",quantity:3}]};
  assert.deepEqual(getEpiDeliveryStockReconciliation(admin,delivery),{status:"complete",items:[{ca:"32546",size:"Modelo fictício",expected:3,issued:3,remaining:0}]});
  assert.throws(()=>exit(second.id,3,1,day(365),{},day(30),true,day(0),"FICHA-EQUIV",3),/excede a quantidade restante/i);
  assert.equal(getEpiDeliveryStockReconciliation(admin,delivery).status,"complete");
});
test("entrada bloqueia a validade do CA transcrita como vencida na consulta",t=>{
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-11-01T12:00:00.000Z")});
  const item=createEpiStockItem(admin,fixture("ca-entry-expired"));
  assert.throws(()=>entry(item.id,1,1,day(365),"2026-10-31"),/validade do CA informada.*vencida/i);
});
test("validade vencida do lote continua bloqueando a saída",t=>{
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-11-01T12:00:00.000Z")});
  const item=createEpiStockItem(admin,fixture("lote-expira","2026-12-01"));
  entry(item.id,1,2,"2026-11-02");
  t.mock.timers.setTime(new Date("2026-11-03T12:00:00.000Z").getTime());
  assert.throws(()=>exit(item.id,2,1,"2026-11-02"),/lote vencido/i);
});
test("módulo desativado e consultoria suspensa bloqueiam escrita",()=>{
  const item=createEpiStockItem(admin,fixture("module"));
  const state=readPlatformState();
  writePlatformState({...state,plans:{"tenant-horizonte":{...DEFAULT_PLAN,config:{...DEFAULT_PLAN.config,disabledModules:["epi"]}}}});
  assert.equal(listEpiStock(admin).some(i=>i.id===item.id),true);
  assert.throws(()=>entry(item.id,1,1));
  writePlatformState({...state,settings:{"tenant-horizonte":{status:"suspended",companiesLimit:100,workersLimit:1000}}});
  assert.throws(()=>listEpiStock(admin));
  assert.throws(()=>createEpiStockItem(admin,fixture("suspended")));
  writePlatformState(state);
});
