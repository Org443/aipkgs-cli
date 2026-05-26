import type { PackageRef } from '@local/archive';
import { ConfigFile } from '../files/config.ts';
import { CredentialsFile } from '../files/credentials.ts';
import { ensureOk } from './http.ts';

async function requireToken() {
  const { token } = await CredentialsFile.resolve();
  if (!token) throw new Error('Not authenticated — run `aipkg login`');
  return token;
}

export const packages = {
  async downloadArchive(args: { pkgRef: PackageRef }) {
    const { pkgRef } = args;

    const url = new URL(`/v1/packages/${pkgRef.path}/archive.tgz`, ConfigFile.apiBase()).toString();
    const res = await fetch(url, { headers: { Accept: 'application/gzip' } });

    await ensureOk(res);

    return Buffer.from(await res.arrayBuffer());
  },

  async uploadArchive(args: { tarball: Buffer }) {
    const { tarball } = args;
    const token = await requireToken();

    const url = new URL('/v1/publish', ConfigFile.apiBase()).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: tarball,
    });

    await ensureOk(res);

    return (await res.json()) as { path: string };
  },

  // No `ensureOk` — callers branch on `status` (404 = unpublished, !ok = warn).
  async checkVersionIntegrity(args: { pkgRef: PackageRef }) {
    const { pkgRef } = args;

    const url = new URL(`/v1/packages/${pkgRef.path}/integrity.json`, ConfigFile.apiBase()).toString();
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    return { ok: res.ok, status: res.status };
  },
};
