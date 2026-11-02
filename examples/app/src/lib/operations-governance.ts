import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { getJobSandbox } from "./job-sandbox.ts";
import { appendAuditEvent } from "./audit-log.ts";
type Policy={revision:number;days:number;hold:boolean};
type Incident={id:string;title:string;status:"open"|"investigating"|"resolved";revision:number;history:{at:number;actorUserId:string;reason:string;status:Incident["status"]}[]};
type DB={policy:Policy;changes:{at:number;actorUserId:string;reason:string;before:Policy;after:Policy}[];incidents:Incident[]};
function read():DB{try{return JSON.parse(readFileSync(join(process.cwd(),"data","operations-governance.json"),"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {policy:{revision:0,days:30,hold:true},changes:[],incidents:[]};throw e;}}
function write(db:DB){const path=join(process.cwd(),"data","operations-governance.json");mkdirSync(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(db),{flag:"wx"});renameSync(temp,path);}
function reason(v:string){if(typeof v!=="string"||!v.trim()||v.length>600)throw new Error("Informe justificativa fictícia de até 600 caracteres.");return v.trim();}
function audit(userId:string,action:"platform.governance_read"|"platform.governance_changed"|"platform.operations_exported",targetId?:string){appendAuditEvent({tenantId:"platform",actorUserId:userId,actorRole:"saas_master",action,targetId});}
export function retentionPreview(policy:Policy,jobs:ReturnType<typeof getJobSandbox>["jobs"],now:number){
  const cutoff=now-policy.days*86400000;
  return jobs.map(j=>{
    const terminal=j.status==="completed"||j.status==="dead",at=j.history.at(-1)?.at??j.createdAt;
    return {id:j.id,eligible:!policy.hold&&terminal&&at<=cutoff,reason:policy.hold?"Bloqueio de descarte ativo":!terminal?"Tarefa ainda em andamento":at>cutoff?"Prazo técnico ainda não atingido":"Elegível apenas na simulação; preservado"};
  });
}
export function getOperationsGovernance(userId:string){requirePlatformMaster(userId);audit(userId,"platform.governance_read");const db=read(),jobs=getJobSandbox(userId);return {...structuredClone(db),retention:retentionPreview(db.policy,jobs.jobs,Date.now()),queueFailures:jobs.jobs.filter(j=>j.status==="dead").length};}
export function changeOperationsPolicy(userId:string,revision:number,days:number,hold:boolean,why:string){
  requirePlatformMaster(userId);throttle(userId);const r=reason(why),db=read();
  if(!Number.isSafeInteger(revision)||revision!==db.policy.revision)throw new Error("Política mudou. Atualize a página antes de salvar.");
  if(!Number.isSafeInteger(days)||days<1||days>365||typeof hold!=="boolean")throw new Error("Informe prazo técnico inteiro entre 1 e 365 dias.");
  if(db.policy.days===days&&db.policy.hold===hold)throw new Error("Nenhuma alteração informada.");
  const before={...db.policy};db.policy={revision:revision+1,days,hold};db.changes.push({at:Date.now(),actorUserId:userId,reason:r,before,after:{...db.policy}});write(db);audit(userId,"platform.governance_changed");
}
export function openOperationsIncident(userId:string,title:string,why:string){
  requirePlatformMaster(userId);throttle(userId);const r=reason(why);
  if(typeof title!=="string"||!title.trim()||title.length>100)throw new Error("Informe título fictício de até 100 caracteres.");
  const db=read(),incident:Incident={id:randomUUID(),title:title.trim(),status:"open",revision:0,history:[{at:Date.now(),actorUserId:userId,reason:r,status:"open"}]};
  db.incidents.push(incident);write(db);audit(userId,"platform.governance_changed",incident.id);return incident.id;
}
export function advanceOperationsIncident(userId:string,id:string,revision:number,next:Incident["status"],why:string){
  requirePlatformMaster(userId);throttle(userId);const r=reason(why),db=read(),i=db.incidents.find(i=>i.id===id);
  if(!i||i.revision!==revision)throw new Error("Incidente indisponível ou alterado. Atualize a página.");
  if(!((i.status==="open"&&next==="investigating")||(i.status==="investigating"&&next==="resolved")))throw new Error("Avance de aberto para em análise e depois resolvido.");
  i.status=next;i.revision++;i.history.push({at:Date.now(),actorUserId:userId,reason:r,status:next});write(db);audit(userId,"platform.governance_changed",i.id);
}
export function exportOperationsSnapshot(userId:string){
  requirePlatformMaster(userId);throttle(userId);const db=read(),queue=getJobSandbox(userId);
  // Projeção explícita: exclui justificativas, textos de incidentes, chaves e dados de outros módulos.
  const snapshot={schema:"sst-operations-demo-v1",generatedAt:new Date().toISOString(),scope:"operational_mock_only",policy:db.policy,jobs:queue.jobs.map(j=>({id:j.id,tenantId:j.tenantId,status:j.status,attempts:j.attempts,createdAt:j.createdAt,lastAt:j.history.at(-1)?.at??j.createdAt})),outbox:queue.outbox.map(e=>({id:e.id,jobId:e.jobId,tenantId:e.tenantId,status:e.status,createdAt:e.createdAt,deliveredAt:e.deliveredAt??null})),incidents:db.incidents.map(i=>({id:i.id,status:i.status,revision:i.revision}))};
  const payload=JSON.stringify(snapshot),sha256=createHash("sha256").update(payload).digest("hex");
  audit(userId,"platform.operations_exported");
  return {manifest:{algorithm:"SHA-256",encoding:"UTF-8",sha256,payloadBytes:Buffer.byteLength(payload)},payload};
}
