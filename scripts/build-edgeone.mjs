import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const astroCli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const result = spawnSync(process.execPath, [astroCli, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
    DEPLOY_TARGET: 'edgeone',
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
