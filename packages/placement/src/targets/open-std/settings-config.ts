import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HooksByEvent } from '@local/archive';
import { isENOENT } from '@local/shared/fs';
import { AIPKG_OWNER_KEY, mergeOwnedHooks, removeOwnedHooks } from '../hooks-format.ts';

type SettingsLocal = {
  hooks?: HooksByEvent;
  statusLine?: Record<string, unknown>;
  [key: string]: unknown;
};

export const settingsConfig = {
  // Claude's settings shape and ownership tagging, but under `.agents/` so the
  // bundle stays self-contained — the standard prescribes no settings file.
  path() {
    const cwd = process.cwd();
    return join(cwd, '.agents', 'settings.json');
  },

  async read(): Promise<SettingsLocal> {
    try {
      const path = settingsConfig.path();
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as SettingsLocal;
    } catch (err) {
      if (isENOENT(err)) return {};
      throw err;
    }
  },

  async write(value: SettingsLocal) {
    const path = settingsConfig.path();
    await mkdir(dirname(path), { recursive: true });
    const body = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(path, body, 'utf8');
  },

  async mergeHooks(args: { slug: string; hooks: HooksByEvent }) {
    const { slug, hooks } = args;
    const settings = await settingsConfig.read();
    settings.hooks = mergeOwnedHooks({ existing: settings.hooks ?? {}, incoming: hooks, slug });
    await settingsConfig.write(settings);
  },

  async removeHooks(args: { slug: string }) {
    const { slug } = args;
    const settings = await settingsConfig.read();
    if (!settings.hooks) return;
    const { hooks, changed } = removeOwnedHooks({ existing: settings.hooks, slug });
    settings.hooks = Object.keys(hooks).length === 0 ? undefined : hooks;
    if (changed) await settingsConfig.write(settings);
  },

  async setStatusLine(args: { slug: string; statusLine: Record<string, unknown> }) {
    const { slug, statusLine } = args;
    const settings = await settingsConfig.read();
    settings.statusLine = { ...statusLine, [AIPKG_OWNER_KEY]: slug };
    await settingsConfig.write(settings);
  },

  async clearStatusLine() {
    const settings = await settingsConfig.read();
    if (settings.statusLine === undefined) return;
    settings.statusLine = undefined;
    await settingsConfig.write(settings);
  },
};
