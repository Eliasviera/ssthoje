import { randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { DEMO_TENANTS } from "./tenant-access.ts";
import { getTenantSettings } from "./tenant-state.ts";
import { appendAuditEvent } from "./audit-log.ts";

type Challenge = { id:string; tenantId:string; actorUserId:string; createdAt:number; expiresAt:number; attempts:number; status:"pending"|"verified"|"locked"|"expired"|"superseded"; salt:string; digest:string };
const path=()=>join(process.cwd(),"data","otp-sandbox.json");
function read():Challenge[] { try{return JSON.parse(readFileSync(path(),"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return [];throw e;} }
function write(rows:Challenge[]) { mkdirSync(dirname(path()),{recursive:true});const temp=`${path()}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(rows),{flag:"wx"});renameSync(temp,path()); }
function authorize(userId:string,tenantId:string) {requirePlatformMaster(userId);if(!DEMO_TENANTS.some(t=>t.id===tenantId)||getTenantSettings(tenantId).status!=="active")throw new Error("Selecione uma consultoria ativa fictícia.");}
function audit(userId:string,id:string) {appendAuditEvent({tenantId:"platform",actorUserId:userId,actorRole:"saas_master",action:"platform.integration_run",targetId:id});}
export function issueSandboxOtp(userId:string,tenantId:string) {
  authorize(userId,tenantId);throttle(userId);
  const rows=read(),now=Date.now();
  for(const r of rows)if(r.tenantId===tenantId && r.actorUserId===userId && r.status==="pending")r.status=r.expiresAt<=now?"expired":"superseded";
  const code=randomInt(0,1000000).toString().padStart(6,"0"),salt=randomUUID();
  const row:Challenge={id:randomUUID(),tenantId,actorUserId:userId,createdAt:now,expiresAt:now+5*60*1000,attempts:0,status:"pending",salt,digest:scryptSync(code,salt,32).toString("hex")};
  rows.push(row);write(rows);audit(userId,row.id);
  return {id:row.id,code,expiresAt:row.expiresAt};
}
export function verifySandboxOtp(userId:string,tenantId:string,id:string,code:string) {
  authorize(userId,tenantId);throttle(userId);
  if(typeof code!=="string" || !/^\d{6}$/.test(code))throw new Error("Informe os seis dígitos do código fictício.");
  const rows=read(),row=rows.find(r=>r.id===id && r.tenantId===tenantId && r.actorUserId===userId);
  if(!row)throw new Error("Teste indisponível para esta consultoria.");
  if(row.status!=="pending")throw new Error("Código encerrado. Gere outro teste fictício.");
  if(row.expiresAt<=Date.now()){row.status="expired";write(rows);audit(userId,row.id);throw new Error("Código expirado. Gere outro teste fictício.");}
  row.attempts++;
  const valid=timingSafeEqual(Buffer.from(row.digest,"hex"),scryptSync(code,row.salt,32));
  if(valid)row.status="verified";else if(row.attempts>=5)row.status="locked";
  write(rows);audit(userId,row.id);
  if(!valid)throw new Error(row.status==="locked"?"Cinco tentativas incorretas. Teste bloqueado; gere outro código.":`Código incorreto. Restam ${5-row.attempts} tentativas.`);
}
export function listSandboxOtps(userId:string) {
  requirePlatformMaster(userId);
  return read().slice(-20).reverse().map(({id,tenantId,createdAt,expiresAt,attempts,status})=>({id,tenantId,createdAt,expiresAt,attempts,status:status==="pending" && expiresAt<=Date.now()?"expired" as const:status}));
}
