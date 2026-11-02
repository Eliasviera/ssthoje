import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = dirname(fileURLToPath(import.meta.url));
const app = resolve(assets, '../examples/app');
// O atalho cotidiano abre a área operacional. A conta Master mantém sua rota própria após o login.
const url = 'http://localhost:3107/';
function compose(args) {
  return spawnSync('docker', ['compose', '--env-file', '../../.env.pg.local', ...args], {
    cwd: app, windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
}
async function ensureDatabase() {
  const started = compose(['up', '-d', 'db']);
  if (started.error || started.status !== 0) {
    throw new Error('Não foi possível iniciar o PostgreSQL. Abra o Docker Desktop e tente novamente.');
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const health = compose(['exec', '-T', 'db', 'pg_isready', '-q', '-U', 'sst_hoje_dev', '-d', 'sst_hoje_dev']);
    if (!health.error && health.status === 0) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('O PostgreSQL não ficou pronto a tempo. Confira o Docker Desktop e tente novamente.');
}
async function ready() {
  try {
    const response = await fetch('http://localhost:3107/login', { signal: AbortSignal.timeout(3000) });
    const page = await response.text();
    return response.ok
      && page.includes('Acesse sua conta')
      && page.includes('id="email"')
      && page.includes('id="password"');
  } catch { return false; }
}
try {
  await ensureDatabase();
  if (!(await ready())) {
    const next = join(app, 'scripts/dev-with-postgres.mjs');
    if (!existsSync(next)) throw new Error('Dependências do projeto não encontradas.');
    const log = openSync(join(assets, 'sst-hoje-inicializacao.log'), 'a');
    const child = spawn(process.execPath, [next], {
      cwd: app, detached: true, windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, PORT: '3107', SST_ISOLATED_BUILD: '0', SST_BUILD_VERIFY_ID: '' },
    });
    child.unref();
    closeSync(log);
    let available = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await ready()) { available = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!available) throw new Error('O sistema não respondeu. Confira sst-hoje-inicializacao.log; a porta 3107 pode estar ocupada.');
  }
  spawn('explorer.exe', [url], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
} catch (error) {
  const path = join(assets, 'sst-hoje-erro.txt');
  writeFileSync(path, `Não foi possível abrir o SST Hoje.\n${error.message}\n`, 'utf8');
  spawn('notepad.exe', [path], { detached: true, stdio: 'ignore' }).unref();
  process.exitCode = 1;
}
