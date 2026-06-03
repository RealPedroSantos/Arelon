import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const viteCliPath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const apiScriptPath = path.join(projectRoot, 'scripts', 'shared-config-api.mjs');
const arelonApiScriptPath = path.join(projectRoot, 'scripts', 'arelon-api-proxy.mjs');

const children = [];
let isShuttingDown = false;

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
}

function spawnProcess(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  children.push(child);

  child.on('exit', (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const normalizedExitCode = typeof code === 'number' ? code : signal ? 1 : 0;
    console.error(`[dev] Processo ${name} finalizou (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`);
    shutdown(normalizedExitCode);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

spawnProcess('config-api', process.execPath, [apiScriptPath]);
spawnProcess('arelon-api', process.execPath, [arelonApiScriptPath]);
spawnProcess('vite', process.execPath, [viteCliPath], {
  VITE_ARELON_API_BASE_URL: process.env.VITE_ARELON_API_BASE_URL ?? 'http://localhost:8789',
});
