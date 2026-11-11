import { spawnSync } from 'node:child_process';

// `prisma generate` only needs a syntactically valid URL; it does not connect.
// Provide a placeholder so installs work before a real DATABASE_URL is set.
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/countersign';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['prisma', 'generate'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
