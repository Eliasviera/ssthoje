// Servidor de prova visual. Reutiliza somente a compilação; todos os dados ficam
// em uma pasta temporária nova. Nunca inicia no diretório de dados ativo.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--isolated-ui-proof")) throw new Error("Use --isolated-ui-proof para iniciar a prova descartável.");
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildId = process.argv.find((value) => value.startsWith("--build-id="))?.slice("--build-id=".length) ?? "convites-20261102";
if (!/^[a-z0-9-]{1,40}$/.test(buildId)) throw new Error("Identificador da compilação inválido.");
const build = join(project, `.next-verify-${buildId}`);
if (!existsSync(join(build, "BUILD_ID"))) throw new Error("A compilação isolada de convites precisa existir antes da prova.");
const root = mkdtempSync(join(tmpdir(), "sst-invite-ui-proof-"));
mkdirSync(join(root, "data"));
mkdirSync(join(root, "public"));
writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
writeFileSync(join(root, "next.config.mjs"), 'export default { distDir: ".next", cacheComponents: true, partialPrefetching: true, experimental: { serverActions: { bodySizeLimit: "8mb" } } };\n');
writeFileSync(join(root, "data", "UI_PROOF_ONLY"), "Somente dados sintéticos desta execução.\n");
// Junction aponta somente à compilação isolada, nunca à pasta de dados.
symlinkSync(build, join(root, ".next"), "junction");
copyFileSync(join(project, "public", "logo-sst-hoje.png"), join(root, "public", "logo-sst-hoje.png"));

const allowed = new Set(["systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile", "localappdata", "appdata", "programfiles", "programfiles(x86)", "comspec", "number_of_processors"]);
for (const key of Object.keys(process.env)) if (!allowed.has(key.toLowerCase())) delete process.env[key];
Object.assign(process.env, {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SST_DEMO_MASTER_EMAIL: "master-ui@example.invalid",
  SST_DEMO_MASTER_PASSWORD: "senha-ficticia-master-ui-123",
  SST_PGR_STORAGE: "json",
});
process.chdir(root);
const { default: next } = await import("next");
const compiledConfig = JSON.parse(readFileSync(join(build, "required-server-files.json"), "utf8")).config;
const application = next({ dev: false, dir: root, hostname: "127.0.0.1", port: 3128, conf: { ...compiledConfig, distDir: ".next" } });
await application.prepare();
const handler = application.getRequestHandler();
const server = createServer((request, response) => {
  if (process.cwd() !== root || !existsSync(join(root, "data", "UI_PROOF_ONLY"))) {
    response.writeHead(503); response.end("Prova isolada indisponível."); return;
  }
  handler(request, response);
});
server.listen(3128, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, url: "http://127.0.0.1:3128", dataDirectory: join(root, "data"), syntheticOnly: true })));
async function stop() {
  server.close();
  await application.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
