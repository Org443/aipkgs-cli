import { chmod } from 'node:fs/promises';
import { build } from 'esbuild';

const outfile = 'dist/index.js';

await build({
  entryPoints: ['src/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

await chmod(outfile, 0o755);
