import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HooksByEvent } from '@local/archive';
import { isENOENT } from '../../fs.ts';
import { mergeOwnedHooks, removeOwnedHooks } from '../hooks-format.ts';

// Codex's hooks system is deliberately Claude-shaped (event → matcher → command),
// but it lives in its own `.codex/hooks.json` file under a top-level `hooks` key
// rather than in Claude's `.claude/settings.local.json`. The per-slug ownership
// tagging and `${PKG_ROOT}` rewriting are shared with the Claude target via
// `hooks-format.ts`.
//
// Placed hooks need two manual steps before Codex runs them (aipkg does neither):
// `[features] hooks = true` in config.toml, and a `/hooks` trust approval.
const HOOKS_FILENAME = join('.codex', 'hooks.json');

type HooksFile = {
  hooks?: HooksByEvent;
  [key: string]: unknown;
};

export const hooksConfig = {
  path(): string {
    return join(process.cwd(), HOOKS_FILENAME);
  },

  async read(): Promise<HooksFile> {
    try {
      const raw = await readFile(hooksConfig.path(), 'utf8');
      return JSON.parse(raw) as HooksFile;
    } catch (err) {
      if (isENOENT(err)) return {};
      throw err;
    }
  },

  async write(value: HooksFile) {
    const path = hooksConfig.path();
    await mkdir(dirname(path), { recursive: true });
    const body = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(path, body, 'utf8');
  },

  async mergeHooks(args: { slug: string; hooks: HooksByEvent }) {
    const { slug, hooks } = args;
    const file = await hooksConfig.read();
    file.hooks = mergeOwnedHooks({ existing: file.hooks ?? {}, incoming: hooks, slug });
    await hooksConfig.write(file);
  },

  async removeHooks(args: { slug: string }) {
    const { slug } = args;
    const file = await hooksConfig.read();
    if (!file.hooks) return false;
    const { hooks, changed } = removeOwnedHooks({ existing: file.hooks, slug });
    file.hooks = Object.keys(hooks).length === 0 ? undefined : hooks;
    if (changed) await hooksConfig.write(file);
    return changed;
  },
};
