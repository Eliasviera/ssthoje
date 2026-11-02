import { lstat,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { analyzeRigorPolicies } from '../src/lib/third-party-rigor-analysis.mjs';
if(process.argv.length!==2)throw new Error('Somente leitura; nenhum argumento de aplicação é aceito.');
const path=resolve('data/third-party-rigor-policies.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)throw new Error('SOURCE_INVALID');
  const before=await readFile(path);
  const result=analyzeRigorPolicies(JSON.parse(before.toString('utf8')));
  const stable=hash(before)===hash(await readFile(path));
  console.log(JSON.stringify({...result,sourceHash:hash(before),stable,blockers:['SCOPE_REFERENCES_UNVERIFIED','HISTORY_NOT_RECONCILED','TRANSACTIONAL_POLICY_NOT_PREPARED']},null,2));
  if(!stable||result.errors.length)process.exitCode=1;
}catch(error){console.error(JSON.stringify({status:'not_ready',code:error.code==='ENOENT'?'SOURCE_MISSING':'SOURCE_UNREADABLE_OR_INVALID',readyForImport:false}));process.exitCode=1;}
