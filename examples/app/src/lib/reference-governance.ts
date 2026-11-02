import { createHash, randomUUID } from "node:crypto";
import {saoPauloDate} from "./business-date.ts";
import { mkdirSync,readFileSync,renameSync,writeFileSync } from "node:fs";
import {dirname,join} from "node:path";
import {requireTenantAccess} from "./tenant-access.ts";
import {throttle} from "./platform-store.ts";
import {appendAuditEvent} from "./audit-log.ts";
import type {ComplianceRule} from "./compliance-store.ts";
type Review={id:string;tenantId:string;ruleId:string;ruleVersion:number;fingerprint:string;outcome:"reviewed"|"needs_update";reason:string;actorUserId:string;at:string};
function access(userId:string,tenantId?:string){const a=requireTenantAccess(userId,"documents.review",tenantId);if(!a.ok)throw new Error("Referências disponíveis somente à equipe autorizada da consultoria.");return a.context;}
function rules(tenantId:string):ComplianceRule[]{try{const db=JSON.parse(readFileSync(join(process.cwd(),"data","compliance.json"),"utf8"));if(!Array.isArray(db.rules))throw new Error("Cadastro de critérios inválido.");return db.rules.filter((r:ComplianceRule)=>r.tenantId===tenantId);}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;}}
function reviews():Review[]{try{return JSON.parse(readFileSync(join(process.cwd(),"data","reference-reviews.json"),"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;}}
function fingerprint(rule:ComplianceRule){return createHash("sha256").update(JSON.stringify([rule.id,rule.version,rule.title,rule.criteria,rule.sourceTitle,rule.sourceVersion,rule.jurisdiction,rule.validFrom,rule.validUntil,rule.reviewer,rule.documentKind])).digest("hex");}
function dateValid(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
export function referenceIssues(rule:ComplianceRule,today:string){const issues:string[]=[];if([rule.title,rule.criteria,rule.sourceTitle,rule.sourceVersion,rule.jurisdiction,rule.reviewer].some(v=>typeof v!=="string"||!v.trim()))issues.push("Metadados obrigatórios incompletos");if(!dateValid(rule.validFrom)||(rule.validUntil&&!dateValid(rule.validUntil))||(rule.validUntil&&rule.validUntil<rule.validFrom))issues.push("Vigência inválida");else if(rule.validFrom>today||(rule.validUntil&&rule.validUntil<today))issues.push("Fora da vigência informada");if(rule.status!=="active")issues.push("Versão substituída");return issues;}
const today=saoPauloDate;
export function getReferenceGovernance(userId:string,tenantId?:string){const ctx=access(userId,tenantId),history=reviews().filter(r=>r.tenantId===ctx.tenant.id);return {tenantName:ctx.tenant.name,rules:rules(ctx.tenant.id).map(r=>{const last=history.filter(h=>h.ruleId===r.id&&h.fingerprint===fingerprint(r)).at(-1);return {rule:r,issues:referenceIssues(r,today()),review:last??null};}),history:history.slice(-30).reverse()};}
export function reviewReference(userId:string,ruleId:string,version:number,outcome:Review["outcome"],reason:string,tenantId?:string){
  const ctx=access(userId,tenantId);throttle(userId);const rule=rules(ctx.tenant.id).find(r=>r.id===ruleId&&r.version===version);
  if(!rule||rule.status!=="active")throw new Error("Critério indisponível ou substituído. Atualize a página.");
  if(!["reviewed","needs_update"].includes(outcome)||typeof reason!=="string"||!reason.trim()||reason.length>600)throw new Error("Informe resultado e justificativa fictícia.");
  if(outcome==="reviewed"&&referenceIssues(rule,today()).length)throw new Error("Corrija metadados e vigência antes de registrar referência conferida.");
  const rows=reviews(),entry:Review={id:randomUUID(),tenantId:ctx.tenant.id,ruleId,ruleVersion:rule.version,fingerprint:fingerprint(rule),outcome,reason:reason.trim(),actorUserId:userId,at:new Date().toISOString()};rows.push(entry);
  const path=join(process.cwd(),"data","reference-reviews.json");mkdirSync(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(rows),{flag:"wx"});renameSync(temp,path);
  appendAuditEvent({tenantId:ctx.tenant.id,actorUserId:userId,actorRole:ctx.membership.role,action:"compliance.reference_reviewed",targetId:entry.id});
}
export function assertReferenceReviewed(userId:string,ruleId:string,tenantId:string){const data=getReferenceGovernance(userId,tenantId),item=data.rules.find(r=>r.rule.id===ruleId);if(!item||item.issues.length||item.review?.outcome!=="reviewed")throw new Error("Confira a referência vigente na área Revisão de referências antes de avaliar. Fonte informada não é validada automaticamente.");}

