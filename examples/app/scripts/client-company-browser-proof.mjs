import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionToken, verifySessionToken } from "../src/lib/session-token.ts";
import { verifyAccountPassword } from "../src/lib/account-credentials.ts";
import { clientCompanyRequestCandidate } from "../src/lib/client-company-request-candidate.ts";
import { listDdsForAccess, listInspectionsForAccess } from "../src/lib/company-scoped-reads.ts";

// Harness local, separado das telas Next e de qualquer cadastro ativo.
// Chamado exclusivamente pelo verificador que cria seu proprio PostgreSQL.
export async function startClientCompanyBrowserProof({ pool, users, tenantId, asIdentity, revokeA, autoStop = false }) {
  const original = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "sst-client-browser-"));
  mkdirSync(join(root, "data"));
  const records = ["a", "b"].map((suffix) => ({ id: `dds-${suffix}`, tenantId, companyId: `company-${suffix}`, unitId: `unit-${suffix}`, createdAt: new Date().toISOString(), theme: `DDS fictício da empresa ${suffix.toUpperCase()}` }));
  writeFileSync(join(root, "data", "dds.json"), JSON.stringify(records));
  writeFileSync(join(root, "data", "checklists.json"), JSON.stringify({ templates: [], inspections: records.map((row) => ({ ...row, id: row.id.replace("dds", "checklist"), templateName: row.theme.replace("DDS", "Checklist") })) }));
  process.chdir(root);
  const secret = randomBytes(48).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  const identities = new Map(users.map((userId, i) => [userId, { userId, email: `client-${i ? "b" : "a"}@example.invalid` }]));
  const attempts = new Map();
  const results = { authenticatedA: false, authenticatedB: false, ownReadA: false, ownReadB: false, crossReadDenied: false, unsignedDenied: false, revokedSessionDenied: false, csrfDenied: false };
  let revoked = false;
  let origin;
  const html = (body) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prova isolada SST HOJE</title><style>body{font:18px system-ui;max-width:760px;margin:40px auto;padding:20px;background:#f6faf8;color:#16392a}label{display:block;margin:16px 0}input,button,a{font:inherit}input{display:block;padding:10px;max-width:95%}button{padding:10px 18px;background:#145b3a;color:white;border:0;border-radius:6px}a{display:inline-block;margin:12px 18px 12px 0;color:#145b3a}:focus-visible{outline:3px solid #b24d00;outline-offset:4px}</style><h1>Prova isolada SST HOJE</h1><p>Somente dados fictícios. Tela de ensaio; não é o painel do produto.</p>${body}</html>`;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    const send = (status, body) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }); response.end(html(body)); };
    try {
      const url = new URL(request.url, origin);
      if (request.method === "POST") {
        if (request.headers.origin !== origin) { results.csrfDenied = true; return send(403, "<h2>Origem recusada</h2>"); }
        const chunks = []; let length = 0;
        for await (const chunk of request) { length += chunk.length; if (length > 4096) return send(413, "Formulário muito grande."); chunks.push(chunk); }
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        if (form.get("csrf") !== csrf) { results.csrfDenied = true; return send(403, "<h2>Formulário recusado</h2>"); }
        if (url.pathname === "/login") {
          const email = (form.get("email") ?? "").trim().toLowerCase();
          const count = (attempts.get(email) ?? 0) + 1;
          attempts.set(email, count);
          if (count > 5 || attempts.size > 100) return send(429, "Limite de tentativas. Reinicie a prova.");
          const row = (await asIdentity((client) => client.query("SELECT * FROM tenant_identity_candidate.lookup_login_account($1)", [email]))).rows[0];
          if (!row || !identities.has(row.user_id) || !await verifyAccountPassword(form.get("password") ?? "", row.password_hash)) return send(401, "<h2>Dados não conferem</h2><a href='/login'>Tentar novamente</a>");
          attempts.delete(email);
          const token = createSessionToken({ userId: row.user_id, email: row.email, expiresAt: Math.floor(Date.now() / 1000) + 3600 }, secret);
          response.setHeader("Set-Cookie", `sst_proof_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
          results[row.user_id === users[0] ? "authenticatedA" : "authenticatedB"] = true;
          response.writeHead(303, { Location: "/" }); return response.end();
        }
        if (url.pathname === "/logout") { response.setHeader("Set-Cookie", "sst_proof_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); response.writeHead(303, { Location: "/login" }); return response.end(); }
        return send(404, "Não encontrado.");
      }
      if (url.pathname === "/login") return send(200, `<h2>Entrar na prova</h2><form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><label>E-mail<input name="email" type="email" required autocomplete="off"></label><label>Senha<input name="password" type="password" required autocomplete="off"></label><button>Entrar</button></form>`);
      const token = (request.headers.cookie ?? "").split("; ").find((part) => part.startsWith("sst_proof_session="))?.slice("sst_proof_session=".length) ?? "";
      const session = verifySessionToken(token, secret, (id) => identities.get(id) ?? null);
      if (!session) { results.unsignedDenied = true; response.writeHead(303, { Location: "/login" }); return response.end(); }
      const access = await clientCompanyRequestCandidate(pool, async () => ({ userId: session.userId, tenantId })).access(url.pathname.startsWith("/checklist") ? "checklist.read" : "dds.read");
      if (!access) { if (revoked && session.userId === users[0]) results.revokedSessionDenied = true; return send(403, "<h2>Acesso indisponível</h2><p>Vínculo revogado, vencido ou suspenso. Procure o responsável.</p>"); }
      const dds = listDdsForAccess(access);
      const checklists = listInspectionsForAccess(access);
      if (url.pathname !== "/") {
        const row = [...dds, ...checklists].find((item) => `/${item.id}` === url.pathname);
        if (!row) { results.crossReadDenied = true; return send(404, "<h2>Registro não encontrado</h2><a href='/'>Voltar</a>"); }
        return send(200, `<h2>${row.templateName ?? row.theme}</h2><a href='/'>Voltar</a>`);
      }
      results[session.userId === users[0] ? "ownReadA" : "ownReadB"] = true;
      return send(200, `<h2>Empresa ${access.companyScope.companyId === "company-a" ? "A" : "B"}</h2><p>Acesso limitado à empresa e unidade vinculadas.</p><h3>DDS</h3>${dds.map((row) => `<a href="/${row.id}">${row.theme}</a>`).join("")}<h3>Checklists</h3>${checklists.map((row) => `<a href="/${row.id}">${row.templateName}</a>`).join("")}<form method="post" action="/logout"><input type="hidden" name="csrf" value="${csrf}"><button>Sair</button></form>`);
    } catch { send(503, "Prova indisponível. Reinicie o ambiente isolado."); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // Falha de uma assertiva nao deve manter o processo vivo pelo socket HTTP.
  server.unref();
  origin = `http://127.0.0.1:${server.address().port}`;
  // Prova HTTP adicional: sessão adulterada e origem de formulário rejeitadas.
  assert.equal((await fetch(origin, { headers: { Cookie: "sst_proof_session=adulterado" }, redirect: "manual" })).status, 303);
  assert.equal((await fetch(`${origin}/login`, { method: "POST", body: "email=ficticio", headers: { Origin: "http://origem-invalida.test" } })).status, 403);
  for (const suffix of ["a", "b"]) {
    const login = await fetch(`${origin}/login`, { method: "POST", redirect: "manual", headers: { Origin: origin },
      body: new URLSearchParams({ csrf, email: `client-${suffix}@example.invalid`, password: "Senha exclusivamente fictícia para prova!" }) });
    assert.equal(login.status, 303);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const page = await fetch(origin, { headers: { Cookie: cookie } });
    const body = await page.text();
    assert.ok(body.includes(`Empresa ${suffix.toUpperCase()}`));
    assert.ok(!body.includes(`Empresa ${suffix === "a" ? "B" : "A"}`));
    for (const kind of ["dds", "checklist"]) {
      const own = await fetch(`${origin}/${kind}-${suffix}`, { headers: { Cookie: cookie } });
      assert.equal(own.status, 200);
      assert.ok((await own.text()).includes(`${kind === "dds" ? "DDS" : "Checklist"} fictício da empresa ${suffix.toUpperCase()}`));
      assert.equal((await fetch(`${origin}/${kind}-${suffix === "a" ? "b" : "a"}`, { headers: { Cookie: cookie } })).status, 404);
    }
  }
  console.log(JSON.stringify({ httpProofPassed: true, twoSignedSessions: true, scopedReaders: true, crossCompany404: true }));
  if (autoStop) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    process.chdir(original);
    return;
  }
  for (const key of Object.keys(results)) results[key] = false;
  console.log(JSON.stringify({ browserProofReady: true, url: origin, syntheticOnly: true, commands: "revoke-a, status, stop" }));
  process.stdin.setEncoding("utf8");
  await new Promise((resolve) => {
    let pending = "";
    const onData = async (chunk) => {
      pending += chunk;
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n"); const line = pending.slice(0, index).trim(); pending = pending.slice(index + 1);
        if (line === "revoke-a") {
          try { await revokeA(); revoked = true; console.log(JSON.stringify({ revokedA: true })); }
          catch { console.log(JSON.stringify({ revokedA: false })); }
        }
        if (line === "status") console.log(JSON.stringify(results));
        if (line === "stop") { process.stdin.off("data", onData); process.stdin.pause(); server.closeAllConnections(); server.close(resolve); }
      }
    };
    process.stdin.on("data", onData);
  });
  process.chdir(original);
  console.log(JSON.stringify({ browserProofResults: results, temporaryDataOnly: true }));
}
