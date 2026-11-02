"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantAccess } from "@/lib/tenant-context";
import { listClientCompanies } from "@/lib/client-service";
import { getEpiDeliveryForStock } from "@/lib/epi-service";
import { createEpiStockItem, moveEpiStock, listEpiStock, reviewEpiStockCa, saveEpiStockDocumentPdf, discardEpiStockDocumentPdf, EpiStockError, epiStockBatchUnitCostCents } from "@/lib/epi-stock-store";
import { listWorkersForTenant } from "@/lib/worker-store";
export type StockFormState={error?:string;success?:string;requiresCaExpiredExitConfirmation?:boolean};
function field(data:FormData,name:string,max:number) {
  const value=data.get(name);
  if (typeof value!=="string" || value.length>max) throw new EpiStockError("Confira os campos e seus limites.");
  return value.trim();
}
function optionalField(data:FormData,name:string,max:number) {
  const value=data.get(name);
  if (value===null) return "";
  if (typeof value!=="string"||value.length>max) throw new EpiStockError("Confira os campos e seus limites.");
  return value.trim();
}
function failure(error:unknown):StockFormState {
  const message=error instanceof EpiStockError?error.message:"Não foi possível salvar. Atualize a página e tente novamente.";
  return {error:message,...(message.startsWith("Saída exige confirmação justificada")||message.startsWith("Informe justificativa da saída com CA vencido")?{requiresCaExpiredExitConfirmation:true}:{})};
}
async function assertScope(tenantId:string,companyId:string,unitId:string) {
  const companies=await listClientCompanies(tenantId);
  if (!companies.some(company=>company.id===companyId && company.status==="active" && company.units.some(unit=>unit.id===unitId))) throw new EpiStockError("Empresa ou unidade indisponível para movimentação.");
}
export async function createStockAction(_previous:StockFormState,data:FormData):Promise<StockFormState> {
  const access=await getCurrentTenantAccess("epi.manage");
  if (!access.context) return {error:"Seu perfil não pode cadastrar itens de estoque."};
  try {
    const scope=field(data,"scope",281).split("|");
    if (scope.length!==2 || !scope[0] || !scope[1]) throw new EpiStockError("Selecione empresa e unidade.");
    const [companyId,unitId]=scope;
    await assertScope(access.context.tenant.id,companyId,unitId);
    const minimum=field(data,"minimumBalance",10);
    if(!/^\d+$/.test(minimum)) throw new EpiStockError("Informe o estoque mínimo inteiro.");
    createEpiStockItem(access.session.userId,{companyId,unitId,code:field(data,"code",60),name:field(data,"name",120),reference:field(data,"reference",80),size:field(data,"size",60),storageLocation:field(data,"storageLocation",200),ca:field(data,"ca",40),caValidUntil:field(data,"caValidUntil",10),caCheckedOn:field(data,"caCheckedOn",10),officialDescription:field(data,"officialDescription",500),approvedProtection:field(data,"approvedProtection",500),minimumBalance:Number(minimum)});
    revalidatePath("/epi/estoque"); revalidatePath("/epi/entregas"); revalidatePath("/epi/fichas"); revalidatePath("/");
    return {success:"Item cadastrado com saldo zero. Registre uma entrada para adicionar unidades."};
  } catch(error) {return failure(error);}
}
export async function reviewStockCaAction(_previous:StockFormState,data:FormData):Promise<StockFormState> {
  const access=await getCurrentTenantAccess("epi.manage");
  if(!access.context) return {error:"Seu perfil não pode revisar dados de CA no estoque."};
  try {
    const id=field(data,"id",36),ca=field(data,"ca",8),checkedOn=field(data,"checkedOn",10),validUntil=field(data,"validUntil",10);
    if(data.get("manualConfirmed")!=="on") throw new EpiStockError("Confirme que consultou manualmente o CAEPI.");
    const item=listEpiStock(access.session.userId).find(record=>record.id===id);
    if(!item) throw new EpiStockError("Item indisponível nesta consultoria.");
    await assertScope(access.context.tenant.id,item.companyId,item.unitId);
    reviewEpiStockCa(access.session.userId,id,{ca,checkedOn,validUntil});
    revalidatePath("/epi/estoque");revalidatePath("/epi/entregas");revalidatePath("/epi/fichas");
    return {success:"Consulta manual registrada. A data e a validade anteriores foram preservadas no histórico; o CAEPI não foi consultado pelo sistema."};
  } catch(error) {return failure(error);}
}
export async function moveStockAction(_previous:StockFormState,data:FormData):Promise<StockFormState> {
  const access=await getCurrentTenantAccess("epi.manage");
  if (!access.context) return {error:"Seu perfil não pode movimentar estoque."};
  try {
    const id=field(data,"id",36),revision=field(data,"revision",10),quantity=field(data,"quantity",10),direction=field(data,"direction",10);
    if (!/^[1-9]\d*$/.test(revision) || !/^[1-9]\d*$/.test(quantity) || !["entry","exit","return"].includes(direction)) throw new EpiStockError("Confira a revisão, o tipo e a quantidade inteira.");
    const item=listEpiStock(access.session.userId).find(item=>item.id===id);
    if (!item) throw new EpiStockError("Item indisponível nesta consultoria.");
    await assertScope(access.context.tenant.id,item.companyId,item.unitId);
    const deliveryRef=direction==="exit"?field(data,"deliveryReference",120):direction==="return"?field(data,"sourceReference",120):"";
    let linkedDeliveryQuantity:number|undefined;
    if(direction==="exit"||direction==="return") {
      const linkedDelivery=getEpiDeliveryForStock(access.session.userId,deliveryRef);
      if(!linkedDelivery||linkedDelivery.status==="canceled"||linkedDelivery.companyId!==item.companyId||linkedDelivery.unitId!==item.unitId) throw new EpiStockError("A ficha de entrega informada não existe, foi cancelada ou pertence a outra unidade.");
      const workerName=direction==="exit"?field(data,"workerName",120):field(data,"returnedBy",120);
      if(workerName.toLocaleLowerCase("pt-BR")!==linkedDelivery.workerName.trim().toLocaleLowerCase("pt-BR")) throw new EpiStockError("O trabalhador informado não corresponde à ficha de entrega.");
      const deliveredQuantity=linkedDelivery.items.filter(epi=>epi.ca===item.ca&&epi.size===item.size).reduce((sum,epi)=>sum+epi.quantity,0);
      if(deliveredQuantity<1) throw new EpiStockError("A ficha informada não contém este CA e tamanho.");
      linkedDeliveryQuantity=deliveredQuantity;
      const relatedStock=listEpiStock(access.session.userId).filter(record=>record.companyId===item.companyId&&record.unitId===item.unitId&&record.ca===item.ca&&record.size===item.size);
      const previousIssued=relatedStock.flatMap(record=>record.movements).filter(movement=>movement.direction==="exit"&&movement.deliveryReference===deliveryRef).reduce((sum,movement)=>sum+movement.quantity,0);
      const previousReturns=relatedStock.flatMap(record=>record.movements).filter(movement=>movement.direction==="return"&&movement.sourceReference===deliveryRef).reduce((sum,movement)=>sum+movement.quantity,0);
      if(direction==="exit"&&previousIssued+Number(quantity)>deliveredQuantity) throw new EpiStockError("A baixa excede a quantidade deste CA e tamanho na ficha de entrega.");
      if(direction==="return"&&Number(quantity)>previousIssued-previousReturns) throw new EpiStockError("A devolução excede a quantidade já baixada para esta ficha.");
    }
    const selectedBatch=optionalField(data,"batchKey",100).split("|");
    const sourceType=optionalField(data,"sourceType",20);
    const enteredCost=optionalField(data,"unitCost",24).replace(",",".");
    if(direction==="entry"&&(!/^\d{1,8}(\.\d{1,2})?$/.test(enteredCost)||!Number.isFinite(Number(enteredCost)))) throw new EpiStockError("Informe um custo unitário válido em reais (ex.: 45,90).");
    const entryUnitCostCents=direction==="entry"?Math.round(Number(enteredCost)*100):undefined;
    const batchUnitCostCents=direction==="exit"?epiStockBatchUnitCostCents(item,selectedBatch[0],selectedBatch[1]):undefined;
    let workerArea="Área não informada";
    if(direction==="exit") {
      const delivery=getEpiDeliveryForStock(access.session.userId,field(data,"deliveryReference",120));
      workerArea=delivery?.workerArea||(delivery?listWorkersForTenant(access.context.tenant.id).find(worker=>worker.id===delivery.workerId)?.area:undefined)||"Área não informada";
    }
    const fileValue=data.get("sourceDocumentPdf");
    let attachment:{id:string;fileName:string}|undefined;
    if(direction==="entry"&&["invoice","warehouse_report"].includes(sourceType)) {
      if(!(fileValue instanceof File)) throw new EpiStockError(sourceType==="invoice"?"Anexe a nota fiscal em PDF da compra direta.":"Anexe o relatório de almoxarifado em PDF.");
      attachment=await saveEpiStockDocumentPdf(fileValue);
    } else if(fileValue instanceof File&&fileValue.size>0) throw new EpiStockError("Anexe PDF somente para nota fiscal ou relatório do almoxarifado.");
    try {
      moveEpiStock(access.session.userId,id,Number(revision),direction as "entry"|"exit"|"return",Number(quantity),field(data,"reason",1200),{type:sourceType,reference:optionalField(data,"sourceReference",120),supplier:optionalField(data,"supplier",160),receivedBy:optionalField(data,"receivedBy",120),batchCode:direction==="exit"?selectedBatch[0]:direction==="entry"?field(data,"batchCode",80):undefined,productValidUntil:direction==="exit"?selectedBatch[1]:direction==="entry"?field(data,"productValidUntil",10):undefined,unitCostCents:direction==="entry"?entryUnitCostCents:batchUnitCostCents,workerArea,sourceDocumentFileId:attachment?.id,sourceDocumentFileName:attachment?.fileName,workerName:optionalField(data,"workerName",120),deliveryReference:optionalField(data,"deliveryReference",120),deliveryQuantity:direction==="exit"?linkedDeliveryQuantity:undefined,caManualChecked:direction!=="return"&&data.get("caManualChecked")==="on",caCheckedOn:direction!=="return"?field(data,"caCheckedOn",10):undefined,caCheckedValidUntil:direction!=="return"?field(data,"caCheckedValidUntil",10):undefined,caExpiredExitConfirmed:direction==="exit"&&data.get("caExpiredExitConfirmed")==="on",caExpiredExitJustification:optionalField(data,"caExpiredExitJustification",500),returnCondition:optionalField(data,"returnCondition",40),returnedBy:optionalField(data,"returnedBy",120)});
    } catch(error) { if(attachment) discardEpiStockDocumentPdf(attachment.id); throw error; }
    revalidatePath("/epi/estoque"); revalidatePath("/epi/entregas"); revalidatePath("/epi/fichas"); revalidatePath("/");
    return {success:"Movimentação registrada. A saída/devolução foi relacionada à referência da ficha e o histórico anterior foi preservado."};
  } catch(error) {return failure(error);}
}
