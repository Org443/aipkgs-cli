import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isENOENT } from '../../fs.ts';

export const SETTINGS_LOCAL_FILENAME = join('.claude', 'settings.local.json');

export type HookCommand = {
  type?: string;
  command?: string;
  timeout?: number;
};

export type HookMatcher = {
  matcher?: string;
  hooks: HookCommand[];
};

export type HooksByEvent = Record<string, HookMatcher[]>;

export type SettingsLocal = {
  hooks?: HooksByEvent;
  [key: string]: unknown;
};

export const settingsConfig = {
  path(): string {
    return join(process.cwd(), SETTINGS_LOCAL_FILENAME);
  },

  async read(): Promise<SettingsLocal> {
    try {
      const raw = await readFile(settingsConfig.path(), 'utf8');
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
    const { slug, hooks: incoming } = args;
    const settings = await settingsConfig.read();
    const existing = settings.hooks ?? {};

    for (const [event, matchers] of Object.entries(incoming)) {
      const tagged = matchers.map((m) => tagMatcher({ matcher: m, slug }));
      const eventBucket = existing[event] ?? [];
      const filtered = eventBucket.filter((m) => !isOwnedBy({ matcher: m, slug }));
      existing[event] = [...filtered, ...tagged];
    }

    settings.hooks = existing;
    await settingsConfig.write(settings);
  },

  async removeHooks(args: { slug: string }) {
    const { slug } = args;
    const settings = await settingsConfig.read();
    const existing = settings.hooks;
    if (!existing) return false;

    let changed = false;
    const rebuilt: HooksByEvent = {};
    for (const [event, matchers] of Object.entries(existing)) {
      const after = matchers.filter((m) => !isOwnedBy({ matcher: m, slug }));
      if (after.length !== matchers.length) changed = true;
      if (after.length > 0) rebuilt[event] = after;
    }

    const next: SettingsLocal = { ...settings };
    if (Object.keys(rebuilt).length === 0) {
      next.hooks = undefined;
    } else {
      next.hooks = rebuilt;
    }

    if (changed) await settingsConfig.write(next);
    return changed;
  },
};

const AIPKG_OWNER_KEY = '__aipkg';

function tagMatcher(args: { matcher: HookMatcher; slug: string }): HookMatcher & { [AIPKG_OWNER_KEY]: string } {
  const { matcher, slug } = args;
  return { ...matcher, [AIPKG_OWNER_KEY]: slug };
}

function isOwnedBy(args: { matcher: HookMatcher; slug: string }): boolean {
  const { matcher, slug } = args;
  const owner = (matcher as { [AIPKG_OWNER_KEY]?: string })[AIPKG_OWNER_KEY];
  return owner === slug;
}
