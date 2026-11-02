import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { requireTenantAccess } from "./tenant-access.ts";
import type { EpiStockReconciliation } from "./epi-store";
import { appendAuditEvent } from "./audit-log.ts";

export type StockMovement = { id: string; direction: "entry" | "exit" | "return"; quantity: number; reason: string; batchCode?: string; productValidUntil?: string; unitCostCents?: number; workerArea?: string; invoiceFileId?: string; invoiceFileName?: string; sourceDocumentFileId?: string; sourceDocumentFileName?: string; workerName?: string; deliveryReference?: string; caManualChecked?: boolean; caCheckedOn?: string; caCheckedValidUntil?: string; caPreviousCheckedOn?: string; caPreviousValidUntil?: string; caExpiredExitConfirmed?: boolean; caExpiredExitJustification?: string; returnCondition?: "inspected_reusable" | "quarantine" | "not_reusable"; returnedBy?: string; sourceType?: "invoice" | "warehouse_report" | "direct_system" | "purchase_order" | "warehouse_transfer" | "other"; sourceReference?: string; supplier?: string; receivedBy?: string; actorUserId: string; occurredAt: string };
export type EpiCaCheck = { id: string; ca: string; checkedOn: string; validUntil: string; recordedAt: string; recordedBy: string; source: "initial_stock_item" | "stock_movement" | "manual_cycle_review"; previousCheckedOn?: string; previousValidUntil?: string };
export type EpiStockItem = {
  id: string; tenantId: string; companyId: string; unitId: string;
  code: string; name: string; reference: string; size: string; storageLocation: string;
  officialDescription?: string; approvedProtection?: string; minimumBalance?: number;
  ca?: string; caValidUntil?: string; caCheckedOn?: string; caSource?: string;
  caCheckHistory?: EpiCaCheck[];
  revision: number; createdAt: string; createdBy: string; movements: StockMovement[];
};
type NewStockItem = Pick<EpiStockItem,"companyId"|"unitId"|"code"|"name"|"reference"|"size"|"storageLocation"|"ca"|"caValidUntil"|"caCheckedOn"|"officialDescription"|"approvedProtection"|"minimumBalance">;
export class EpiStockError extends Error {}
const path = () => join(process.cwd(), "data", "epi-stock.json");
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
const recentDateLimit = () => new Date(Date.parse(`${today()}T12:00:00Z`)-15*86400000).toISOString().slice(0,10);
function context(userId: string, manage = false) {
  const access = requireTenantAccess(userId, manage ? "epi.manage" : "epi.read");
  if (!access.ok) throw new EpiStockError("Seu perfil não pode realizar esta operação de estoque.");
  return access.context;
}
function read(): EpiStockItem[] {
  try {
    const data: unknown = JSON.parse(readFileSync(path(), "utf8"));
    if (!Array.isArray(data)) throw new Error("Formato local do estoque inválido.");
    return data as EpiStockItem[];
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
function write(data: EpiStockItem[]) {
  mkdirSync(dirname(path()), {recursive:true});
  const temporary = `${path()}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data,null,2)+"\n", {flag:"wx"});
  renameSync(temporary,path());
}
function text(value: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new EpiStockError("Preencha os campos obrigatórios dentro dos limites informados.");
  return value.trim();
}
export function epiStockBalance(item: EpiStockItem): number {
  return item.movements.reduce((balance,movement)=>balance+(movement.direction==="entry"?movement.quantity:movement.direction==="exit"?-movement.quantity:0),0);
}
export function epiStockBatches(item:EpiStockItem) {
  const batches=new Map<string,{batchCode:string;productValidUntil:string;balance:number}>();
  for(const movement of item.movements) {
    if(!movement.batchCode||!movement.productValidUntil) continue;
    const key=`${movement.batchCode}|${movement.productValidUntil}`;
    const batch=batches.get(key)??{batchCode:movement.batchCode,productValidUntil:movement.productValidUntil,balance:0};
    batch.balance+=movement.direction==="entry"?movement.quantity:movement.direction==="exit"?-movement.quantity:0;
    batches.set(key,batch);
  }
  return [...batches.values()].filter(batch=>batch.balance>0).sort((a,b)=>a.productValidUntil.localeCompare(b.productValidUntil));
}
export function epiStockBatchUnitCostCents(item:EpiStockItem,batchCode:string,productValidUntil:string):number|undefined {
  let quantity=0,value=0,hasCost=false,unknownCost=false;
  for(const movement of item.movements) {
    if(movement.batchCode!==batchCode||movement.productValidUntil!==productValidUntil) continue;
    if(movement.direction==="entry") {quantity+=movement.quantity;if(Number.isSafeInteger(movement.unitCostCents)){value+=movement.quantity*movement.unitCostCents!;hasCost=true;}else unknownCost=true;}
    else if(movement.direction==="exit") {quantity-=movement.quantity;if(Number.isSafeInteger(movement.unitCostCents))value-=movement.quantity*movement.unitCostCents!;else unknownCost=true;}
  }
  return hasCost&&!unknownCost&&quantity>0?Math.max(0,Math.round(value/quantity)):undefined;
}
export function listEpiStock(userId: string): EpiStockItem[] {
  const {tenant} = context(userId);
  return read().filter(item=>item.tenantId===tenant.id).reverse();
}
export function reviewEpiStockCa(userId:string,id:string,input:{ca:string;checkedOn:string;validUntil:string}):EpiStockItem {
  const {tenant,membership}=context(userId,true);
  const data=read(),item=data.find(record=>record.id===id&&record.tenantId===tenant.id);
  if(!item) throw new EpiStockError("Item indisponível nesta consultoria.");
  if(typeof input.ca!=="string"||input.ca.trim()!==item.ca||!/^\d{1,8}$/.test(input.ca.trim())) throw new EpiStockError("O CA consultado deve corresponder ao CA cadastrado neste item. Se o CA for diferente, cadastre outro item.");
  const validDate=(value:string)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
  if(!validDate(input.checkedOn)||!validDate(input.validUntil)||input.checkedOn>today()||input.checkedOn<recentDateLimit()) throw new EpiStockError("Registre uma consulta manual válida, realizada hoje ou nos últimos 15 dias.");
  const checkedOn=input.checkedOn,validUntil=input.validUntil;
  item.caCheckHistory??=[];
  item.caCheckHistory.push({id:randomUUID(),ca:item.ca??"",checkedOn,validUntil,recordedAt:new Date().toISOString(),recordedBy:userId,source:"manual_cycle_review",previousCheckedOn:item.caCheckedOn,previousValidUntil:item.caValidUntil});
  item.caCheckedOn=checkedOn;item.caValidUntil=validUntil;item.revision+=1;
  write(data);
  appendAuditEvent({tenantId:tenant.id,actorUserId:userId,actorRole:membership.role,action:"epi.stock_ca_reviewed",targetId:item.id});
  return structuredClone(item);
}
export function getEpiDeliveryStockReconciliation(userId: string, delivery: {id:string;tenantId:string;companyId:string;unitId:string;items:Array<{ca?:string;size:string;quantity:number}>}): EpiStockReconciliation {
  const {tenant}=context(userId);
  if(delivery.tenantId!==tenant.id) throw new EpiStockError("A ficha não pertence a esta consultoria.");
  const stock=read().filter(item=>item.tenantId===tenant.id&&item.companyId===delivery.companyId&&item.unitId===delivery.unitId);
  const expected=new Map<string,{ca:string;size:string;expected:number}>();
  for(const item of delivery.items) {
    const ca=item.ca??"",key=`${ca}|${item.size}`;
    const current=expected.get(key)??{ca,size:item.size,expected:0};
    current.expected+=item.quantity;expected.set(key,current);
  }
  const items=[...expected.values()].map(item=>{
    const issued=stock.filter(record=>record.ca===item.ca&&record.size===item.size)
      .flatMap(record=>record.movements)
      .filter(movement=>movement.direction==="exit"&&movement.deliveryReference===delivery.id)
      .reduce((sum,movement)=>sum+movement.quantity,0);
    return {...item,issued,remaining:Math.max(0,item.expected-issued)};
  });
  const overIssued=items.some(item=>item.issued>item.expected);
  return {status:overIssued?"over_issued":items.every(item=>item.remaining===0)?"complete":"pending",items};
}
const sourceDocumentDirectory=()=>join(process.cwd(),"data","epi-stock-documents");
const legacyInvoiceDirectory=()=>join(process.cwd(),"data","epi-invoices");
export async function saveEpiStockDocumentPdf(file:File) {
  if (!file || file.size<8 || file.size>15*1024*1024 || file.type!=="application/pdf") throw new EpiStockError("Anexe um documento PDF válido de até 15 MB.");
  const bytes=Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0,5).toString("ascii")!=="%PDF-") throw new EpiStockError("O arquivo anexado não parece ser um PDF válido.");
  const id=randomUUID();
  mkdirSync(sourceDocumentDirectory(),{recursive:true});
  writeFileSync(join(sourceDocumentDirectory(),`${id}.pdf`),bytes,{flag:"wx"});
  const fileName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"documento-estoque.pdf";
  return {id,fileName};
}
export function discardEpiStockDocumentPdf(id:string) {
  if(!/^[0-9a-f-]{36}$/i.test(id)) return;
  try { unlinkSync(join(sourceDocumentDirectory(),`${id}.pdf`)); } catch {}
}
export async function saveEpiInvoicePdf(file:File) {
  return saveEpiStockDocumentPdf(file);
}
export function discardEpiInvoicePdf(id:string) {
  discardEpiStockDocumentPdf(id);
}
export function readEpiInvoicePdf(userId:string,itemId:string,movementId:string) {
  const {tenant}=context(userId);
  if(!/^[0-9a-f-]{36}$/i.test(itemId)||!/^[0-9a-f-]{36}$/i.test(movementId)) return null;
  const item=read().find(record=>record.id===itemId&&record.tenantId===tenant.id);
  const movement=item?.movements.find(record=>record.id===movementId&&record.invoiceFileId);
  const sourceDocument=item?.movements.find(record=>record.id===movementId&&record.sourceDocumentFileId);
  const fileId=sourceDocument?.sourceDocumentFileId??movement?.invoiceFileId;
  if(!fileId) return null;
  try {
    const directory=sourceDocument?sourceDocumentDirectory():legacyInvoiceDirectory();
    return {bytes:readFileSync(join(directory,`${fileId}.pdf`)),fileName:sourceDocument?.sourceDocumentFileName??movement?.invoiceFileName??"documento-estoque.pdf"};
  } catch { return null; }
}
export function createEpiStockItem(userId: string, input: NewStockItem): EpiStockItem {
  const {tenant} = context(userId,true);
  const ca=text(input.ca??"",40), size=text(input.size,60);
  const generatedCode = ca && /^\d{1,8}$/.test(ca) ? `${ca}-${size}` : "";
  const values = {companyId:text(input.companyId,140),unitId:text(input.unitId,140),code:(input.code?.trim() || generatedCode || text(input.code,60)).slice(0,60).toUpperCase(),
    name:text(input.name,120),reference:text(input.reference,80),size,storageLocation:text(input.storageLocation,200),officialDescription:text(input.officialDescription??"",500),approvedProtection:text(input.approvedProtection??"",500),minimumBalance:input.minimumBalance??0,ca,caValidUntil:text(input.caValidUntil??"",10),caCheckedOn:text(input.caCheckedOn??"",10),caSource:"https://caepi.trabalho.gov.br/internet/ConsultaCAInternet.aspx"};
  if (!Number.isSafeInteger(values.minimumBalance) || values.minimumBalance<0 || values.minimumBalance>1000000) throw new EpiStockError("Informe um estoque mínimo inteiro entre zero e 1.000.000.");
  if (!values.officialDescription || !values.approvedProtection) throw new EpiStockError("Transcreva a descrição e as proteções aprovadas na consulta do CAEPI.");
  const validDate = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
  if (!/^\d{1,8}$/.test(values.ca) || !validDate(values.caValidUntil) || !validDate(values.caCheckedOn)) throw new EpiStockError("Informe CA numérico, validade do CA e data da consulta oficial.");
  if (values.caValidUntil < today()) throw new EpiStockError("Cadastro bloqueado: o CA informado está vencido. Consulte a base oficial e selecione um EPI com CA vigente.");
  if (values.caCheckedOn > today() || values.caCheckedOn < recentDateLimit()) throw new EpiStockError("A conferência manual do CA deve ter sido realizada nos últimos 15 dias.");
  const data=read();
  if (data.some(item=>item.tenantId===tenant.id && item.companyId===values.companyId && item.unitId===values.unitId && item.code===values.code)) {
    throw new EpiStockError("Esse código já existe nesta empresa e unidade. Use o item cadastrado.");
  }
  const createdAt=new Date().toISOString();
  const item:EpiStockItem={...values,id:randomUUID(),tenantId:tenant.id,revision:1,createdAt,createdBy:userId,movements:[],caCheckHistory:[{id:randomUUID(),ca:values.ca,checkedOn:values.caCheckedOn,validUntil:values.caValidUntil,recordedAt:createdAt,recordedBy:userId,source:"initial_stock_item"}]};
  write([...data,item]);
  return structuredClone(item);
}
export function moveEpiStock(userId:string,id:string,expectedRevision:number,direction:"entry"|"exit"|"return",quantity:number,reason:string,source:{type?:string;reference?:string;supplier?:string;receivedBy?:string;batchCode?:string;productValidUntil?:string;unitCostCents?:number;workerArea?:string;invoiceFileId?:string;invoiceFileName?:string;sourceDocumentFileId?:string;sourceDocumentFileName?:string;workerName?:string;deliveryReference?:string;deliveryQuantity?:number;caManualChecked?:boolean;caCheckedOn?:string;caCheckedValidUntil?:string;caExpiredExitConfirmed?:boolean;caExpiredExitJustification?:string;returnCondition?:string;returnedBy?:string}={}):EpiStockItem {
  const {tenant}=context(userId,true);
  const data=read();
  const item=data.find(item=>item.id===id && item.tenantId===tenant.id);
  if (!item) throw new EpiStockError("Item indisponível nesta consultoria.");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision!==item.revision) throw new EpiStockError("O saldo mudou. Atualize a página antes de movimentar.");
  if (!["entry","exit","return"].includes(direction) || !Number.isSafeInteger(quantity) || quantity<1 || quantity>1000000) throw new EpiStockError("Informe entrada, saída ou devolução e quantidade inteira entre 1 e 1.000.000.");
  const safeReason=text(reason,1200);
  if(direction==="return") {
    if(!["inspected_reusable","quarantine","not_reusable"].includes(source.returnCondition??"")) throw new EpiStockError("Classifique a condição do EPI devolvido.");
    const returnedBy=text(source.returnedBy??"",120),sourceReference=text(source.reference??"",120);
    item.movements.push({id:randomUUID(),direction,quantity,reason:safeReason,returnCondition:source.returnCondition as StockMovement["returnCondition"],returnedBy,sourceReference,actorUserId:userId,occurredAt:new Date().toISOString()});
    item.revision+=1;write(data);return structuredClone(item);
  }
  const validDate = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
  const caCheckedValidUntil=text(source.caCheckedValidUntil??"",10),caCheckedOn=text(source.caCheckedOn??"",10);
  if(!validDate(caCheckedValidUntil)||!validDate(caCheckedOn)) throw new EpiStockError("Informe a data da consulta manual e a validade do CA nesta movimentação.");
  if(source.caManualChecked!==true) throw new EpiStockError("Confirme que consultou manualmente o CAEPI nesta movimentação. O sistema não faz consulta automática.");
  if(caCheckedOn>today()||caCheckedOn<recentDateLimit()) throw new EpiStockError("Movimentação bloqueada: a conferência manual do CA tem mais de 15 dias ou está no futuro.");
  if(direction==="entry"&&caCheckedValidUntil<today()) throw new EpiStockError("Entrada bloqueada: a validade do CA informada na consulta manual está vencida.");
  const batchCode=text(source.batchCode??"",80), productValidUntil=text(source.productValidUntil??"",10);
  if(direction==="entry"&&(!Number.isSafeInteger(source.unitCostCents)||source.unitCostCents!<0)) throw new EpiStockError("Informe o custo unitário deste lote em reais.");
  if (!validDate(productValidUntil)) throw new EpiStockError("Informe uma validade de produto válida para o lote.");
  if (direction==="entry" && productValidUntil<today()) throw new EpiStockError("Entrada bloqueada: o lote do produto está vencido.");
  if (direction==="exit") {
    const batch=epiStockBatches(item).find(value=>value.batchCode===batchCode&&value.productValidUntil===productValidUntil);
    if (!batch || batch.productValidUntil<today() || batch.balance<quantity) throw new EpiStockError("Saída bloqueada: lote vencido ou saldo insuficiente neste lote.");
    const deliveryQuantity=source.deliveryQuantity;
    if(typeof deliveryQuantity!=="number"||!Number.isSafeInteger(deliveryQuantity)||deliveryQuantity<1) throw new EpiStockError("Informe a quantidade da ficha vinculada para validar o limite de saída.");
    const deliveryReference=text(source.deliveryReference??"",120);
    const alreadyIssued=data.filter(record=>record.tenantId===tenant.id&&record.companyId===item.companyId&&record.unitId===item.unitId&&record.ca===item.ca&&record.size===item.size)
      .flatMap(record=>record.movements).filter(movement=>movement.direction==="exit"&&movement.deliveryReference===deliveryReference)
      .reduce((sum,movement)=>sum+movement.quantity,0);
    if(alreadyIssued+quantity>deliveryQuantity) throw new EpiStockError("A saída excede a quantidade restante da ficha vinculada.");
  }
  let caExpiredExitConfirmation:Pick<StockMovement,"caExpiredExitConfirmed"|"caExpiredExitJustification">={};
  if(direction==="exit"&&caCheckedValidUntil<today()) {
    if(source.caExpiredExitConfirmed!==true) throw new EpiStockError("Saída exige confirmação justificada de gestor: o CA informado está vencido. A confirmação não declara conformidade.");
    if(typeof source.caExpiredExitJustification!=="string"||!source.caExpiredExitJustification.trim()||source.caExpiredExitJustification.length>500) throw new EpiStockError("Informe justificativa da saída com CA vencido (até 500 caracteres).");
    caExpiredExitConfirmation={caExpiredExitConfirmed:true,caExpiredExitJustification:source.caExpiredExitJustification.trim()};
  }
  const receipt: Pick<StockMovement,"sourceType"|"sourceReference"|"supplier"|"receivedBy"|"batchCode"|"productValidUntil"|"unitCostCents"|"workerArea"|"invoiceFileId"|"invoiceFileName"|"sourceDocumentFileId"|"sourceDocumentFileName"|"workerName"|"deliveryReference"|"caManualChecked"|"caCheckedOn"|"caCheckedValidUntil"|"caPreviousCheckedOn"|"caPreviousValidUntil"> = {batchCode,productValidUntil,caManualChecked:true,caCheckedOn,caCheckedValidUntil,caPreviousCheckedOn:item.caCheckedOn,caPreviousValidUntil:item.caValidUntil,...(direction === "entry" ? { unitCostCents:source.unitCostCents,sourceType: source.type as StockMovement["sourceType"], sourceReference: text(source.reference??"",120), ...(source.supplier?.trim()?{supplier:text(source.supplier,160)}:{}), receivedBy: text(source.receivedBy??"",120), ...(source.invoiceFileId?{invoiceFileId:source.invoiceFileId,invoiceFileName:source.invoiceFileName||"nota-fiscal.pdf"}:{}), ...(source.sourceDocumentFileId?{sourceDocumentFileId:source.sourceDocumentFileId,sourceDocumentFileName:source.sourceDocumentFileName||"documento-estoque.pdf"}:{}) } : direction === "exit" ? {unitCostCents:source.unitCostCents,workerArea:source.workerArea?text(source.workerArea,120):"Área não informada",workerName:text(source.workerName??"",120),deliveryReference:text(source.deliveryReference??"",120)} : {})};
  if (direction === "entry" && !["invoice","warehouse_report","direct_system","purchase_order","warehouse_transfer","other"].includes(receipt.sourceType??"")) throw new EpiStockError("Informe a origem da entrada do estoque de EPI.");
  if (direction === "entry" && ["invoice","purchase_order"].includes(receipt.sourceType??"") && !receipt.supplier) throw new EpiStockError("Informe o fornecedor da compra de EPI.");
  if (direction === "entry" && receipt.sourceType === "invoice" && !receipt.sourceDocumentFileId && !receipt.invoiceFileId) throw new EpiStockError("Anexe a nota fiscal em PDF para registrar a compra direta.");
  if (direction === "entry" && receipt.sourceType === "warehouse_report" && !receipt.sourceDocumentFileId) throw new EpiStockError("Anexe o relatório de almoxarifado em PDF.");
  if (direction === "entry" && ["invoice","warehouse_report"].includes(receipt.sourceType??"") && !receipt.sourceDocumentFileId && receipt.invoiceFileId) {
    receipt.sourceDocumentFileId=receipt.invoiceFileId;
    receipt.sourceDocumentFileName=receipt.invoiceFileName;
    delete receipt.invoiceFileId;
    delete receipt.invoiceFileName;
  }
  const balance=epiStockBalance(item)+(direction==="entry"?quantity:direction==="exit"?-quantity:0);
  if (balance<0 || balance>1000000) throw new EpiStockError("Movimentação recusada: o saldo deve ficar entre zero e 1.000.000 de unidades.");
  item.caCheckHistory??=[];
  item.caCheckHistory.push({id:randomUUID(),ca:item.ca??"",checkedOn:caCheckedOn,validUntil:caCheckedValidUntil,recordedAt:new Date().toISOString(),recordedBy:userId,source:"stock_movement",previousCheckedOn:item.caCheckedOn,previousValidUntil:item.caValidUntil});
  item.caValidUntil=caCheckedValidUntil;item.caCheckedOn=caCheckedOn;
  item.movements.push({id:randomUUID(),direction,quantity,reason:safeReason,...receipt,...caExpiredExitConfirmation,actorUserId:userId,occurredAt:new Date().toISOString()});
  item.revision+=1;
  write(data);
  return structuredClone(item);
}
