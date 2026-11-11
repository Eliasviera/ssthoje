import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes, createHmac } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { createSessionToken, verifySessionToken } from "../src/lib/session-token.ts";
import { verifyAccountPassword } from "../src/lib/account-credentials.ts";
import { consultancyServicePostgresCandidate } from "../src/lib/consultancy-service-postgres-candidate.ts";
import { consultantDdsCandidate } from "../src/lib/consultant-dds-candidate.ts";

// Harness local, sem montagem de rotas do produto ou acesso ao pool ativo.
export async function startConsultancyServiceBrowserProof({ pool, users, tenantId, setup, asIdentity, autoStop }) {
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "sst-service-ui-"));
  mkdirSync(join(directory, "data"));
  const records = ["a", "b"].map((suffix) => ({ id: `dds-${suffix}`, tenantId, companyId: `company-${suffix}`, unitId: `unit-${suffix}`,
    theme: `DDS fictício da empresa ${suffix.toUpperCase()}`, heldOn: "2026-11-03", location: "Pátio fictício", responsible: "Responsável fictício", notes: "Dados exclusivamente sintéticos",
    status: "collecting", revision: 1, attendees: [{ id: `attendee-${suffix}`, workerName: "Participante fictício", registered: false }], history: [], createdAt: new Date().toISOString() }));
  writeFileSync(join(directory, "data", "dds.json"), JSON.stringify(records));
  process.chdir(directory);
  let proposalId = setup.proposalId;
  const identities = new Map([["admin-test", { userId: "admin-test", email: "consultant@example.invalid" }], ...users.map((userId, i) => [userId, { userId, email: `client-${i ? "b" : "a"}@example.invalid` }])]);
  const secret = randomBytes(48).toString("hex");
  const csrfSecret = randomBytes(32).toString("hex");
  const csrf = (token) => createHmac("sha256", csrfSecret).update(token || "anonymous-login").digest("hex");
  const attempts = new Map();
  const actionAttempts = new Map();
  let origin;
  let representativeOrigin;
  const observed = { clientPreview: false, clientConfirmed: false, clientRevoked: false, consultantRead: false, consultantPdf: false, consultantDenied: false };
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const page = (content) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmação de consultoria — prova SST HOJE</title><style>body{font:18px system-ui;max-width:800px;margin:28px auto;padding:18px;color:#183d2b;background:#f4f9f6}label{display:block;margin:16px 0}input:not([type=checkbox]),button{font:inherit;padding:10px}input:not([type=checkbox]){display:block;max-width:94%}button{background:#155d3b;color:white;border:0;border-radius:5px;margin:8px 8px 8px 0}a{display:inline-block;color:#155d3b;margin:12px 14px 12px 0}:focus-visible{outline:3px solid #b34b00;outline-offset:4px}dt{font-weight:bold;margin-top:12px}dd{margin-left:0}small{font-size:16px}</style><h1>Confirmação de consultoria</h1><p>Ensaio isolado. Todas as contas, evidências e informações são fictícias.</p>${content}</html>`;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    const send = (status, body) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }); response.end(page(body)); };
    const redirect = (location) => { response.writeHead(303, { Location: location }); response.end(); };
    try {
      const requestOrigin = `http://${request.headers.host}`;
      if (![origin, representativeOrigin].includes(requestOrigin)) return send(421, "Host não autorizado para este ensaio.");
      const path = new URL(request.url, origin).pathname;
      const token = (request.headers.cookie ?? "").split("; ").find((item) => item.startsWith("sst_service_proof="))?.slice("sst_service_proof=".length) ?? "";
      const session = verifySessionToken(token, secret, (id) => identities.get(id) ?? null);
      const authenticate = async () => session ? { userId: session.userId, tenantId } : null;
      const repo = consultancyServicePostgresCandidate(pool, authenticate);
      if (!["GET", "POST"].includes(request.method)) return send(405, "Método não permitido.");
      if (request.method === "POST") {
        if (request.headers.origin !== requestOrigin) return send(403, "<h2>Origem recusada</h2>");
        const chunks = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 4096) return send(413, "Formulário muito grande."); chunks.push(chunk); }
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        if (form.get("csrf") !== csrf(path === "/login" ? "" : token)) return send(403, "<h2>Formulário recusado</h2>");
        if (path === "/login") {
          const email = (form.get("email") ?? "").trim().toLowerCase();
          if (email.length > 254 || (form.get("password") ?? "").length > 256) return send(400, "Confira os campos.");
          const now = Date.now();
          for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
          const attempt = attempts.get(email) ?? { count: 0, until: now + 900000 };
          if (++attempt.count > 5 || attempts.size >= 100) return send(429, "Muitas tentativas. Aguarde 15 minutos.");
          attempts.set(email, attempt);
          const account = (await asIdentity((client) => client.query("SELECT * FROM tenant_identity_candidate.lookup_login_account($1)", [email]))).rows[0];
          if (!account || !identities.has(account.user_id) || !await verifyAccountPassword(form.get("password") ?? "", account.password_hash)) return send(401, "<h2>Dados não conferem</h2><a href='/login'>Tentar novamente</a>");
          attempts.delete(email);
          const signed = createSessionToken({ userId: account.user_id, email: account.email, expiresAt: Math.floor(now / 1000) + 3600 }, secret);
          response.setHeader("Set-Cookie", `sst_service_proof=${signed}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
          return redirect("/");
        }
        if (!session) return send(401, "Entre novamente.");
        if (path === "/logout") { response.setHeader("Set-Cookie", "sst_service_proof=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); return redirect("/login"); }
        if (path === "/decision") {
          const now = Date.now();
          for (const [key, value] of actionAttempts) if (value.until <= now) actionAttempts.delete(key);
          const limit = actionAttempts.get(session.userId) ?? { count: 0, until: now + 900000 };
          if (++limit.count > 20 || actionAttempts.size >= 100) return send(429, "Muitas decisões. Aguarde 15 minutos e tente novamente.");
          actionAttempts.set(session.userId, limit);
          const choice = form.get("choice");
          if (!["confirmed", "rejected", "revoked"].includes(choice) || !/^[1-9][0-9]{0,8}$/.test(form.get("revision") ?? "")) return send(400, "Revise a proposta.");
          if (choice === "confirmed" && form.get("ack") !== "yes") return send(400, "<h2>Confirme a conferência do escopo</h2><a href='/proposal'>Revisar proposta</a>");
          try { await repo.decide({ proposalId, expectedRevision: Number(form.get("revision")), choice, authorityReviewId: setup.authorityReviewId }); }
          catch { return send(409, "<h2>Não foi possível decidir</h2><p>O acesso ou a revisão mudou. Atualize e revise a proposta.</p>"); }
          if (choice === "confirmed") observed.clientConfirmed = true;
          if (choice === "revoked") observed.clientRevoked = true;
          return redirect("/proposal");
        }
        return send(404, "Não encontrado.");
      }
      if (path === "/login") return send(200, `<h2>Entrar no ensaio</h2><form action='/login' method='post'><input type='hidden' name='csrf' value='${csrf("")}'><label>E-mail<input name='email' type='email' required autocomplete='off'></label><label>Senha<input name='password' type='password' required autocomplete='off'></label><button>Entrar</button></form>`);
      if (!session) return redirect("/login");
      const logout = `<form method='post' action='/logout'><input type='hidden' name='csrf' value='${csrf(token)}'><button>Sair</button></form>`;
      if (path === "/proposal") {
        let preview;
        try { preview = await repo.preview(proposalId, setup.authorityReviewId); } catch { return send(403, "<h2>Responsável não autorizado para esta proposta</h2>"); }
        observed.clientPreview = true;
        const status = { pending: "Pendente de confirmação", confirmed: "Confirmada", rejected: "Recusada", revoked: "Revogada" }[preview.status];
        const controls = preview.status === "pending" ? `<label><input type='checkbox' name='ack' value='yes'> Conferi consultoria, empresa, unidade, escopo e vigência.</label><button name='choice' value='confirmed'>Confirmar prestação</button><button name='choice' value='rejected'>Recusar</button>` : preview.status === "confirmed" ? "<button name='choice' value='revoked'>Revogar autorização</button>" : "";
        return send(200, `<h2>Proposta para a empresa A</h2><p><strong>${status}</strong> · Revisão ${preview.revision}</p><dl><dt>Consultoria</dt><dd>Consultoria fictícia · Consultor fictício</dd><dt>Empresa e unidade</dt><dd>${escape(preview.companyId)} / ${escape(preview.unitId)}</dd><dt>Escopo</dt><dd>${escape(preview.description)}</dd><dt>Vigência até</dt><dd>${escape(new Date(preview.validUntil).toLocaleDateString("pt-BR", { timeZone: "UTC" }))}</dd></dl><p>A autoridade deste responsável foi verificada apenas com evidência fictícia neste ensaio.</p><form method='post' action='/decision'><input type='hidden' name='csrf' value='${csrf(token)}'><input type='hidden' name='revision' value='${preview.revision}'>${controls}</form><a href='/'>Voltar</a>${logout}`);
      }
      if (path.startsWith("/consultor/dds/")) {
        const match = /^\/consultor\/dds\/(dds-[ab])(\/pdf)?$/.exec(path);
        if (!match) return send(404, "DDS indisponível.");
        const service = consultantDdsCandidate(pool, authenticate);
        if (match[2]) {
          const pdf = await service.pdf(match[1]);
          if (pdf.status === 200) observed.consultantPdf = true; else observed.consultantDenied = true;
          response.writeHead(pdf.status, Object.fromEntries(pdf.headers)); return response.end(Buffer.from(await pdf.arrayBuffer()));
        }
        const record = await service.read(match[1]);
        if (!record) { observed.consultantDenied = true; return send(404, "<h2>DDS indisponível</h2><p>Sem autorização vigente para este registro.</p><a href='/'>Voltar</a>"); }
        observed.consultantRead = true;
        return send(200, `<h2>${escape(record.theme)}</h2><p>${escape(record.location)}</p><a href='/consultor/dds/${record.id}/pdf'>Baixar PDF do DDS</a><a href='/'>Voltar</a>`);
      }
      return send(200, `<h2>${session.userId === "admin-test" ? "Consultor fictício" : "Responsável da empresa"}</h2><a href='/proposal'>Revisar proposta</a><a href='/consultor/dds/dds-a'>Abrir DDS da empresa A</a>${logout}`);
    } catch { send(503, "Ensaio indisponível. Reinicie a prova."); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); server.unref();
  origin = `http://127.0.0.1:${server.address().port}`;
  // Cookies por hostname separados permitem manter as duas sessoes no browser.
  representativeOrigin = `http://localhost:${server.address().port}`;
  try {
    const login = async (email, password) => {
      const formPage = await (await fetch(`${origin}/login`)).text();
      const loginCsrf = /name='csrf' value='([^']+)'/.exec(formPage)[1];
      const result = await fetch(`${origin}/login`, { method: "POST", redirect: "manual", headers: { Origin: origin }, body: new URLSearchParams({ email, password, csrf: loginCsrf }) });
      assert.equal(result.status, 303); return result.headers.get("set-cookie").split(";")[0];
    };
    const consultantCookie = await login("consultant@example.invalid", "Senha fictícia exclusiva da prova de prestação!");
    const clientCookie = await login("client-a@example.invalid", "Senha exclusivamente fictícia para prova!");
    const otherCookie = await login("client-b@example.invalid", "Senha exclusivamente fictícia para prova!");
    const get = (path, cookie) => fetch(`${origin}${path}`, { headers: { Cookie: cookie } });
    assert.equal((await get("/consultor/dds/dds-a", consultantCookie)).status, 404);
    assert.equal((await get("/consultor/dds/dds-a/pdf", consultantCookie)).status, 404);
    assert.equal((await get("/proposal", otherCookie)).status, 403);
    const clientPage = await (await get("/proposal", clientCookie)).text();
    assert.ok(clientPage.includes("Pendente de confirmação")); assert.ok(clientPage.includes("company-a / unit-a"));
    const clientCsrf = /name='csrf' value='([^']+)'/.exec(clientPage)[1];
    const decide = (values, validOrigin = origin) => fetch(`${origin}/decision`, { method: "POST", redirect: "manual", headers: { Cookie: clientCookie, Origin: validOrigin }, body: new URLSearchParams({ csrf: clientCsrf, ...values }) });
    assert.equal((await decide({ choice: "confirmed", revision: "1" })).status, 400);
    assert.equal((await decide({ choice: "confirmed", revision: "1", ack: "yes" }, "http://invalid.example")).status, 403);
    assert.equal((await decide({ choice: "confirmed", revision: "1", ack: "yes" })).status, 303);
    assert.equal((await decide({ choice: "confirmed", revision: "1", ack: "yes" })).status, 409);
    assert.equal((await get("/consultor/dds/dds-a", consultantCookie)).status, 200);
    const pdf = await get("/consultor/dds/dds-a/pdf", consultantCookie);
    assert.equal(pdf.status, 200); assert.equal(pdf.headers.get("Cache-Control"), "private, no-store");
    const bytes = Buffer.from(await pdf.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-"); assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
    assert.equal((await get("/consultor/dds/dds-b/pdf", consultantCookie)).status, 404);
    assert.equal((await decide({ choice: "revoked", revision: "2" })).status, 303);
    assert.equal((await get("/consultor/dds/dds-a", consultantCookie)).status, 404);
    assert.equal((await get("/consultor/dds/dds-a/pdf", consultantCookie)).status, 404);
    console.log(JSON.stringify({ serviceHttpPassed: true, previewAndExplicitConfirmation: true, signedConsultantSession: true, readAndRealPdfGated: true, staleRevisionRejected: true, csrfDenied: true, revokedExistingSessionDenied: true }));
    if (!autoStop) {
      proposalId = await setup.createProposal();
      for (const key of Object.keys(observed)) observed[key] = false;
      console.log(JSON.stringify({ serviceBrowserReady: true, consultantUrl: origin, representativeUrl: representativeOrigin, syntheticOnly: true, commands: "status, stop" }));
      process.stdin.setEncoding("utf8");
      await new Promise((resolve) => {
        let pending = "";
        const onData = (chunk) => {
          pending += chunk;
          while (pending.includes("\n")) {
            const i = pending.indexOf("\n"); const line = pending.slice(0, i).trim(); pending = pending.slice(i + 1);
            if (line === "status") console.log(JSON.stringify(observed));
            if (line === "stop") { process.stdin.off("data", onData); process.stdin.pause(); resolve(); }
          }
        };
        process.stdin.on("data", onData);
      });
      console.log(JSON.stringify({ serviceBrowserObserved: observed }));
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); process.chdir(previousDirectory); }
}
