import { lstat,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { reconcileRigorSources } from '../src/lib/third-party-rigor-reconciliation.mjs';
if(process.argv.length!==2)throw new Error('Somente leitura; argumentos não são aceitos.');
const paths=['data/third-party-rigor-policies.json','data/clients.json','data/audit-log.jsonl'].map(path=>resolve(path));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  const before=[];
  for(const path of paths){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw new Error('SOURCE_INVALID');before.push(await readFile(path));}
  const result=reconcileRigorSources(JSON.parse(before[0].toString('utf8')),JSON.parse(before[1].toString('utf8')),before[2].toString('utf8').split(/\r?\n/));
  const after=await Promise.all(paths.map(path=>readFile(path)));
  const stable=before.every((bytes,index)=>hash(bytes)===hash(after[index]));
  console.log(JSON.stringify({...result,sourceHashes:before.map(hash),stable,blockers:['POLICY_CHANGE_HISTORY_INCOMPLETE','TRANSACTIONAL_SOURCE_ADAPTER_NOT_PREPARED']},null,2));
  if(!stable||result.errors.length)process.exitCode=1;
}catch(error){console.error(JSON.stringify({status:'not_ready',code:error.code==='ENOENT'?'SOURCE_MISSING':'SOURCE_UNREADABLE_OR_INVALID',readyForImport:false}));process.exitCode=1;}
