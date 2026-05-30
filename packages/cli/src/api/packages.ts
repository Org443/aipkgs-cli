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
  // Live registry search backing the interactive `aipkg <type> <ref>` picker.
  // Prefix-matches the full ref (`<type>/<partial>`) via the catch-all route
  // GET /v1/packages/:partialRef{.+} and returns a CLI-friendly shape (one ref
  // + description per row).
  async search(args: { type: string; partial: string; limit?: number }) {
    const { type, partial, limit = 12 } = args;

    // The ref column is `<type>/<org>[/<key>]/<slug>`, so the search prefix is
    // the type joined with whatever the user has typed so far. The route is a
    // catch-all, so the slashes stay literal in the path — no encoding needed
    // (refs are restricted to `[a-z0-9-_]` segments).
    const url = new URL(`/v1/packages/${type}/${partial}`, ConfigFile.apiBase());
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });

    await ensureOk(res);

    // The route returns the repo's keyset Page verbatim: `{ rows, nextCursor? }`.
    const body = (await res.json()) as {
      rows: Array<{
        type: string;
        org_namespace: string;
        key?: string | null;
        slug: string;
        description?: string | null;
      }>;
    };

    return body.rows.map((p) => {
      const ref = p.key ? `${p.org_namespace}/${p.key}/${p.slug}` : `${p.org_namespace}/${p.slug}`;
      return { type: p.type, ref, description: p.description ?? '' };
    });
  },

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
