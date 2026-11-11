import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listRuntimeTenants } from "./tenant-access.ts";
import { getTenantSettings } from "./tenant-state.ts";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { appendAuditEvent } from "./audit-log.ts";

export type AsaasConfig = { enabled: boolean; token: string; tenantId: string; paymentId: string };
export function asaasConfig(): AsaasConfig { return { enabled: process.env.SST_ASAAS_SANDBOX_ENABLED === "true", token: process.env.SST_ASAAS_WEBHOOK_TOKEN ?? "", tenantId: process.env.SST_ASAAS_SANDBOX_TENANT_ID ?? "", paymentId: process.env.SST_ASAAS_SANDBOX_PAYMENT_ID ?? "" }; }
export function asaasReady(c: AsaasConfig) { return c.enabled && /^[^\s]{32,255}$/.test(c.token) && listRuntimeTenants().some(t=>t.id===c.tenantId) && /^pay_[a-zA-Z0-9_-]{1,100}$/.test(c.paymentId); }
export function authenticateAsaas(token: string | null, c: AsaasConfig) {
  if (!asaasReady(c)) return false;
  const a=Buffer.from(token ?? ""), b=Buffer.from(c.token);
  return a.length===b.length && timingSafeEqual(a,b);
}
export class InboxError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status=status; } }
const eventStates: Record<string,string> = { PAYMENT_CREATED:"created", PAYMENT_CONFIRMED:"confirmed", PAYMENT_RECEIVED:"received", PAYMENT_OVERDUE:"overdue", PAYMENT_REFUNDED:"refunded" };
export type InboxEvent = { id: string; source: "local" | "asaas_sandbox"; event: string; paymentId: string; tenantId: string | null; amountCents: number | null; state: string; receivedAt: string; fingerprint: string };
const dir = () => join(process.cwd(),"data","asaas-inbox");
function normalized(input: unknown) {
  const x=input as {id?:unknown;event?:unknown;payment?:{id?:unknown;value?:unknown}};
  if (!x || typeof x!=="object" || typeof x.id!=="string" || !/^[a-zA-Z0-9_&-]{1,160}$/.test(x.id) || typeof x.event!=="string" || !/^[A-Z_]{1,80}$/.test(x.event) || typeof x.payment?.id!=="string" || !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(x.payment.id)) throw new InboxError(400,"Evento de cobrança inválido.");
  const v=x.payment.value;
  if (v!==undefined && (typeof v!=="number" || !Number.isFinite(v) || v<0 || v>1000000 || Math.abs(v*100-Math.round(v*100))>0.000001)) throw new InboxError(400,"Valor inválido.");
  return {id:x.id,event:x.event,paymentId:x.payment.id,amountCents:typeof v==="number" ? Math.round(v*100) : null};
}
// Persistência imutável: hard link publica o arquivo completo sem sobrescrever outro processo.
// Estado recebido é evidência para revisão; nunca liquida cobrança ou libera acesso.
export function receiveAsaas(input: unknown, c: AsaasConfig, source: InboxEvent["source"]) {
  if (!asaasReady(c)) throw new InboxError(503,"Receptor sandbox desativado ou sem configuração completa.");
  const n=normalized(input), tenantId=n.paymentId===c.paymentId ? c.tenantId : null;
  const state=!tenantId ? "unmapped" : getTenantSettings(tenantId).status!=="active" ? "tenant_suspended" : !Object.hasOwn(eventStates,n.event) ? "unsupported" : n.amountCents!==100 ? "amount_mismatch" : eventStates[n.event];
  const fingerprint=createHash("sha256").update(JSON.stringify(n)).digest("hex");
  const record: InboxEvent={...n,source,tenantId,state,receivedAt:new Date().toISOString(),fingerprint};
  const name=createHash("sha256").update(`${source}:${n.id}`).digest("hex")+".json";
  mkdirSync(dir(),{recursive:true}); const path=join(dir(),name);
  const existing=()=> { const old=JSON.parse(readFileSync(path,"utf8")) as InboxEvent; if (old.fingerprint!==fingerprint) throw new InboxError(409,"ID de evento reutilizado com conteúdo diferente."); return {duplicate:true,event:old}; };
  if (existsSync(path)) return existing();
  const temp=join(dir(),`${randomUUID()}.tmp`);
  writeFileSync(temp,JSON.stringify(record),{flag:"wx"});
  try { linkSync(temp,path); }
  catch(e) { if ((e as NodeJS.ErrnoException).code==="EEXIST") return existing(); throw e; }
  finally { unlinkSync(temp); }
  return {duplicate:false,event:record};
}
export function listAsaasInbox(userId: string) {
  requirePlatformMaster(userId);
  appendAuditEvent({tenantId:"platform",actorUserId:userId,actorRole:"saas_master",action:"platform.integration_read"});
  let files:string[]; try { files=readdirSync(dir()); } catch(e) { if ((e as NodeJS.ErrnoException).code==="ENOENT") return []; throw e; }
  return files.filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(f=>JSON.parse(readFileSync(join(dir(),f),"utf8")) as InboxEvent).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,30);
}
export function exerciseAsaasInbox(userId:string, replay:boolean) {
  requirePlatformMaster(userId); throttle(userId);
  const c:AsaasConfig={enabled:true,token:"local-fixture-token-never-a-provider-secret",tenantId:"tenant-horizonte",paymentId:"pay_local_fixture"};
  const last=replay ? listAsaasInbox(userId).find(e=>e.source==="local") : undefined;
  if(replay && !last) throw new Error("Registre primeiro um evento local.");
  const result=receiveAsaas({id:last?.id ?? `evt_local_${randomUUID()}`,event:"PAYMENT_RECEIVED",payment:{id:c.paymentId,value:1}},c,"local");
  appendAuditEvent({tenantId:"platform",actorUserId:userId,actorRole:"saas_master",action:"platform.integration_run",targetId:result.event.id});
  return result.duplicate;
}
