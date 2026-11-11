import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePlatformMaster, throttle } from "./platform-store.ts";
import { listRuntimeTenants } from "./tenant-access.ts";
import { getTenantSettings } from "./tenant-state.ts";
import { MOCK_ADAPTERS } from "./integration-adapters.ts";
import { appendAuditEvent } from "./audit-log.ts";

export type JobScenario="success"|"transient"|"permanent";
type Job={id:string;tenantId:string;key:string;scenario:JobScenario;reason:string;createdAt:number;nextAt:number;attempts:number;status:"queued"|"retry"|"completed"|"dead";history:{at:number;message:string}[]};
type Outbox={id:string;jobId:string;tenantId:string;createdAt:number;status:"pending"|"delivered_local";deliveredAt?:number};
type DB={jobs:Job[];outbox:Outbox[]};
function read():DB {try{return JSON.parse(readFileSync(join(process.cwd(),"data","job-sandbox.json"),"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return {jobs:[],outbox:[]};throw e;}}
function write(db:DB){const path=join(process.cwd(),"data","job-sandbox.json");mkdirSync(dirname(path),{recursive:true});const temp=`${path}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(db),{flag:"wx"});renameSync(temp,path);}
function audit(userId:string,id?:string){appendAuditEvent({tenantId:"platform",actorUserId:userId,actorRole:"saas_master",action:"platform.job_changed",targetId:id});}
export function getJobSandbox(userId:string){requirePlatformMaster(userId);appendAuditEvent({tenantId:"platform",actorUserId:userId,actorRole:"saas_master",action:"platform.jobs_read"});return structuredClone(read());}
export function enqueueSandboxJob(userId:string,tenantId:string,scenario:JobScenario,key:string,reason:string){
  requirePlatformMaster(userId);throttle(userId);
  if(!listRuntimeTenants().some(t=>t.id===tenantId)||getTenantSettings(tenantId).status!=="active"||!["success","transient","permanent"].includes(scenario)||!/^[-a-zA-Z0-9]{8,80}$/.test(key)||typeof reason!=="string"||!reason.trim()||reason.length>600)throw new Error("Confira consultoria ativa, cenário e justificativa fictícia.");
  const db=read(),old=db.jobs.find(j=>j.tenantId===tenantId&&j.key===key);
  if(old){if(old.scenario!==scenario||old.reason!==reason.trim())throw new Error("Chave já usada para outra tarefa. Atualize a página.");return old.id;}
  const now=Date.now(),job:Job={id:randomUUID(),tenantId,key,scenario,reason:reason.trim(),createdAt:now,nextAt:now,attempts:0,status:"queued",history:[{at:now,message:"Tarefa fictícia enfileirada."}]};
  db.jobs.push(job);write(db);audit(userId,job.id);return job.id;
}
export function processSandboxJob(userId:string){
  requirePlatformMaster(userId);throttle(userId);const db=read(),now=Date.now();
  const job=db.jobs.find(j=>(j.status==="queued"||j.status==="retry")&&j.nextAt<=now&&getTenantSettings(j.tenantId).status==="active");
  if(!job)return "Nenhuma tarefa pronta. Confira o prazo da próxima tentativa e o estado da consultoria.";
  job.attempts++;
  const failed=job.scenario==="permanent"||(job.scenario==="transient"&&job.attempts<3);
  if(failed){
    if(job.attempts>=3){job.status="dead";job.history.push({at:now,message:"Terceira falha: tarefa preservada na fila de falhas para análise."});}
    else{job.status="retry";job.nextAt=now+5000*2**(job.attempts-1);job.history.push({at:now,message:`Falha simulada. Nova tentativa disponível em ${5000*2**(job.attempts-1)/1000} segundos.`});}
  }else{
    MOCK_ADAPTERS.email_otp.execute({tenantId:job.tenantId,kind:"email_otp",key:job.key});
    job.status="completed";job.history.push({at:now,message:"Adaptador fictício concluído; mensagem não enviada."});
    db.outbox.push({id:randomUUID(),jobId:job.id,tenantId:job.tenantId,createdAt:now,status:"pending"});
  }
  // Conclusão e evento pendente gravados juntos, sem publicação externa.
  write(db);audit(userId,job.id);
  return job.status==="completed"?"Tarefa concluída localmente. Evento registrado na caixa de saída.":job.status==="dead"?"Tarefa preservada na fila de falhas após três tentativas.":"Falha simulada registrada. Aguarde o prazo antes de processar novamente.";
}
export function deliverSandboxOutbox(userId:string){
  requirePlatformMaster(userId);throttle(userId);const db=read(),event=db.outbox.find(e=>e.status==="pending"&&getTenantSettings(e.tenantId).status==="active");
  if(!event)return "Nenhum evento pendente de consultoria ativa.";
  event.status="delivered_local";event.deliveredAt=Date.now();write(db);audit(userId,event.id);
  return "Entrega fictícia registrada uma vez. Nenhum destinatário externo.";
}
