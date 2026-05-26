import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AGENT_TARGETS, type AgentTarget } from '@local/archive';
import { isENOENT } from '../io/fs.ts';

export const DEFAULT_API = 'https://api.aipkgs.com';
export const DEFAULT_APP = 'https://app.aipkgs.com';

export type Config = {
  api: string;
  target?: AgentTarget;
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

  static async resolve(): Promise<Config> {
    try {
      const raw = await readFile(ConfigFile.path(), 'utf8');
      return JSON.parse(raw) as Config;
    } catch (err) {
      if (isENOENT(err)) {
        const config: Config = { api: DEFAULT_API, target: 'claude' };
        await writeConfig(config);
        return config;
      }
      throw err;
    }
  }

  static async setApi(api: string): Promise<void> {
    const config = await ConfigFile.resolve();
    config.api = api;
    await writeConfig(config);
  }

  static async setTarget(target: AgentTarget | undefined): Promise<void> {
    const config = await ConfigFile.resolve();
    if (target === undefined) {
      config.target = undefined;
    } else {
      config.target = target;
    }
    await writeConfig(config);
  }

  static async resolvedTarget(): Promise<AgentTarget> {
    const env = process.env.AIPKG_TARGET;
    if (env !== undefined) {
      const valid = (AGENT_TARGETS as readonly string[]).includes(env);
      if (!valid) throw new Error(`Invalid AIPKG_TARGET "${env}". Valid values: ${AGENT_TARGETS.join(', ')}`);
      return env as AgentTarget;
    }
    const { target } = await ConfigFile.resolve();
    if (!target) {
      throw new Error('No target configured. Set with `aipkg set target <target>` or `AIPKG_TARGET=<target>`');
    }
    return target;
  }

  static async delete(): Promise<void> {
    try {
      await rm(ConfigFile.path());
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
}

async function writeConfig(config: Config): Promise<void> {
  const path = ConfigFile.path();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
  await chmod(path, 0o644);
}
