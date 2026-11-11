import { readFileSync } from "node:fs";
import pg from "pg";
const TENANT="tenant-horizonte", INV="pdf-f05f31498b17b47c98d8fc9c3fed94f719f176ed0e92490b";
const password=readFileSync("../../.env.pg.local","utf8").split(/\r?\n/).find(l=>l.startsWith("POSTGRES_PASSWORD=")).slice(18).trim();
const c=new pg.Client({host:"127.0.0.1",port:54329,database:"sst_hoje_dev",user:"sst_hoje_dev",password});
await c.connect();
try{
  // recria a revisao do snapshot com status atualizado, seguindo o padrao do app
  const cur=await c.query("SELECT content FROM sst.pgr_risk_inventory_revisions WHERE tenant_id=$1 AND inventory_id=$2 ORDER BY revision DESC LIMIT 1",[TENANT,INV]);
  const content=cur.rows[0].content;
  console.log("itens no snapshot:", content.items.length);
  await c.query("BEGIN");
  // draft -> in_review
  let r=4; // revisões 1–3 já existem no histórico
  for(const next of ["in_review","approved"]){
    const snap={...content, revision:r};
    await c.query("UPDATE sst.pgr_risk_inventories SET status=$3, revision=$4, reviewer_user_id=$5, reviewer_role=$6, updated_at=now() WHERE tenant_id=$1 AND id=$2",
      [TENANT,INV,next,r, next==="approved"?"sst-demo-user":null, next==="approved"?"consultoria_admin":null]);
    await c.query("INSERT INTO sst.pgr_risk_inventory_revisions (tenant_id, inventory_id, revision, content, actor_user_id, actor_role, created_at) VALUES ($1,$2,$3,$4,$5,$6,now())",
      [TENANT,INV,r,JSON.stringify(snap),"sst-demo-user","consultoria_admin"]);
    console.log("->",next,"revisao",r);
    r++;
  }
  await c.query("COMMIT");
  const out=await c.query("SELECT status, revision, reviewer_user_id FROM sst.pgr_risk_inventories WHERE tenant_id=$1 AND id=$2",[TENANT,INV]);
  console.log("estado final:",JSON.stringify(out.rows[0]));
}catch(e){await c.query("ROLLBACK").catch(()=>{});console.error("ERRO:",e.message);process.exitCode=1}
finally{await c.end()}
