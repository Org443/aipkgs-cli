import pc from 'picocolors';
import { ConfigFile } from '../files/config.ts';
import { promptTargets } from './set.ts';

// On the very first run (no config.json yet) ask which agent(s) to target and
// persist the choice. Skipped when AIPKG_TARGET is set (env wins) or when this
// isn't an interactive TTY (CI / piped input) — those paths fall back to the
// env value or the "no target configured" error raised at use time.
export async function ensureConfigured() {
  if (process.env.AIPKG_TARGET !== undefined) return;
  if (await ConfigFile.exists()) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  console.log(pc.dim("Welcome to aipkgs! Let's set up which coding agent(s) you use."));

  const chosen = await promptTargets({ message: 'Select your agent target(s)' });
  if (chosen === null) {
    console.error(pc.red('Setup cancelled — no agent target selected.'));
    process.exit(1);
  }
  console.log('');
}
