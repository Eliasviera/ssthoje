import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = dirname(fileURLToPath(import.meta.url));
const app = resolve(assets, '../examples/app');
const url = 'http://127.0.0.1:3000/master';
async function ready() {
  try {
    const response = await fetch('http://127.0.0.1:3000/login', { signal: AbortSignal.timeout(3000) });
    return response.ok && (await response.text()).includes('SST Hoje');
  } catch { return false; }
}
try {
  if (!(await ready())) {
    const next = join(app, 'node_modules/next/dist/bin/next');
    if (!existsSync(next)) throw new Error('Dependências do projeto não encontradas.');
    const log = openSync(join(assets, 'sst-hoje-inicializacao.log'), 'a');
    const child = spawn(process.execPath, [next, 'dev', '--hostname', '127.0.0.1', '--port', '3000'], {
      cwd: app, detached: true, windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, SST_ISOLATED_BUILD: '0', SST_BUILD_VERIFY_ID: '' },
    });
    child.unref();
    closeSync(log);
    let available = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await ready()) { available = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!available) throw new Error('O sistema não respondeu. Confira sst-hoje-inicializacao.log; a porta 3000 pode estar ocupada.');
  }
  spawn('explorer.exe', [url], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
} catch (error) {
  const path = join(assets, 'sst-hoje-erro.txt');
  writeFileSync(path, `Não foi possível abrir o SST Hoje.\n${error.message}\n`, 'utf8');
  spawn('notepad.exe', [path], { detached: true, stdio: 'ignore' }).unref();
  process.exitCode = 1;
}
