import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AGENT_TARGETS, type AgentTarget, isENOENT } from '@local/archive';

export const DEFAULT_API = 'https://api.aipkgs.com';
export const DEFAULT_APP = 'https://aipkgs.com';

export type MirrorState = 'enabled' | 'disabled';

export type Config = {
  targets?: AgentTarget[];
  mirror?: MirrorState;
};

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class ConfigFile {
  static apiBase() {
    return process.env.AIPKG_API ?? DEFAULT_API;
  }

  static appBase() {
    return process.env.AIPKG_APP ?? DEFAULT_APP;
  }

  static path() {
    return join(homedir(), '.aipkg', 'config.json');
  }

  // Whether a config.json exists on disk. First-run flows use this to decide
  // whether to prompt for an initial agent target selection.
  static async exists(): Promise<boolean> {
    try {
      await readFile(ConfigFile.path(), 'utf8');
      return true;
    } catch (err) {
      if (isENOENT(err)) return false;
      throw err;
    }
  }

  static async resolve(): Promise<Config> {
    let raw: string;
    try {
      raw = await readFile(ConfigFile.path(), 'utf8');
    } catch (err) {
      if (isENOENT(err)) return {};
      throw err;
    }
    const parsed = JSON.parse(raw) as Config & { target?: AgentTarget };
    return migrateLegacyTarget(parsed);
  }

  static async setTargets(targets: AgentTarget[]): Promise<void> {
    const config = await ConfigFile.resolve();
    config.targets = targets.length > 0 ? targets : undefined;
    await writeConfig(config);
  }

  static async setAipkgsMirror(state: MirrorState): Promise<void> {
    const config = await ConfigFile.resolve();
    // Drop the field entirely when disabling so the config stays minimal.
    config.mirror = state === 'enabled' ? 'enabled' : undefined;
    await writeConfig(config);
  }

  // The effective mirror state, defaulting to `'disabled'` when unset.
  static async aipkgsMirror(): Promise<MirrorState> {
    const { mirror } = await ConfigFile.resolve();
    return mirror ?? 'disabled';
  }

  static async resolvedTargets(): Promise<AgentTarget[]> {
    const env = process.env.AIPKG_TARGET;
    if (env !== undefined) {
      const parsed = env
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      for (const value of parsed) {
        const valid = (AGENT_TARGETS as readonly string[]).includes(value);
        if (!valid) throw new Error(`Invalid AIPKG_TARGET "${value}". Valid values: ${AGENT_TARGETS.join(', ')}`);
      }
      if (parsed.length === 0) throw new Error('AIPKG_TARGET is set but empty.');
      return parsed as AgentTarget[];
    }
    const { targets } = await ConfigFile.resolve();
    if (!targets || targets.length === 0) {
      throw new Error('No target configured. Set with `aipkg set target <target...>` or `AIPKG_TARGET=<target>`');
    }
    return targets;
  }

  static async delete(): Promise<void> {
    try {
      await rm(ConfigFile.path());
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
}

// Idempotent: fold a legacy singular `target` into `targets`, drop the old
// field, and persist so the rewrite only happens on the first read.
async function migrateLegacyTarget(config: Config & { target?: AgentTarget }): Promise<Config> {
  if (config.target === undefined) return config;
  const { target, ...rest } = config;
  const migrated: Config = { ...rest, targets: rest.targets ?? [target] };
  await writeConfig(migrated);
  return migrated;
}

async function writeConfig(config: Config): Promise<void> {
  const path = ConfigFile.path();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  await chmod(path, 0o644);
}
