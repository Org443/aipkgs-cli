import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { isENOENT } from '../io/fs.ts';

export type Credentials = {
  token?: string;
  user?: { id: string; email: string };
};

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class CredentialsFile {
  static path() {
    return join(homedir(), '.aipkg', 'credentials.json');
  }

  static async resolve(): Promise<Credentials> {
    let credentials: Credentials;
    try {
      const raw = await readFile(CredentialsFile.path(), 'utf8');
      credentials = JSON.parse(raw) as Credentials;
    } catch (err) {
      if (isENOENT(err)) {
        credentials = {};
        await writeCredentials(credentials);
      } else {
        throw err;
      }
    }
    if (process.env.AIPKG_TOKEN !== undefined) credentials.token = process.env.AIPKG_TOKEN;
    return credentials;
  }

  static async setToken(token: string | undefined): Promise<void> {
    const credentials = await CredentialsFile.resolve();
    credentials.token = token;
    await writeCredentials(credentials);
  }

  static async setUser(user: { id: string; email: string } | undefined): Promise<void> {
    const credentials = await CredentialsFile.resolve();
    credentials.user = user;
    await writeCredentials(credentials);
  }

  static async delete(): Promise<void> {
    try {
      await rm(CredentialsFile.path());
    } catch (err) {
      if (!isENOENT(err)) throw err;
    }
  }
}

async function writeCredentials(credentials: Credentials): Promise<void> {
  const path = CredentialsFile.path();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600);
}
