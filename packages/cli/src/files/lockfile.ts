import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { type AIpkgArchive, MANIFEST_FILENAME, MANIFEST_TYPES, Manifest, PackageRef } from '@local/archive';
import { isENOENT } from '../io/fs.ts';

export const LOCKFILE_FILENAME = 'aipkg.lock';

// Derive the lockfile path that pairs with a given manifest path. Pairing
// keeps each manifest's pins isolated: `aipkg.json` → `aipkg.lock`,
// `aipkg.reviewer.json` → `aipkg.reviewer.lock`.
export function lockfilePathFor(manifestPath: string): string {
  const dir = dirname(manifestPath);
  const base = basename(manifestPath);
  if (base === MANIFEST_FILENAME) return join(dir, LOCKFILE_FILENAME);
  const trimmed = base.endsWith('.json') ? base.slice(0, -'.json'.length) : base;
  return join(dir, `${trimmed}.lock`);
}

export type LockEntry = {
  aipkgRef: string;
  version: string;
  sha: string;
  parent?: string;
};

export type LockStatusLineEntry = {
  slug: string;
  statusLine: Record<string, unknown>;
  parent?: string;
};

type LockfileStruct = {
  deps?: {
    skills?: Record<string, LockEntry>;
    subagents?: Record<string, LockEntry>;
    rules?: Record<string, LockEntry>;
    setups?: Record<string, LockEntry>;
    boxes?: Record<string, LockEntry>;
    statusLine?: LockStatusLineEntry;
  };
};

export class Lockfile implements LockfileStruct {
  deps?: {
    skills?: Record<string, LockEntry>;
    subagents?: Record<string, LockEntry>;
    rules?: Record<string, LockEntry>;
    setups?: Record<string, LockEntry>;
    boxes?: Record<string, LockEntry>;
    statusLine?: LockStatusLineEntry;
  };

  readonly path: string;

  private constructor(args: LockfileStruct & { path: string }) {
    this.deps = args.deps;
    this.path = args.path;
  }

  static resolvePath({ file }: { file?: string } = {}): string {
    if (!file) return join(process.cwd(), LOCKFILE_FILENAME);
    if (isAbsolute(file)) return file;
    return join(process.cwd(), file);
  }

  static async resolve({ file }: { file?: string } = {}): Promise<Lockfile> {
    const path = Lockfile.resolvePath({ file });
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as LockfileStruct;
      return new Lockfile({ deps: parsed.deps ?? {}, path });
    } catch (err) {
      if (isENOENT(err)) {
        const lf = new Lockfile({ deps: {}, path });
        await lf.write();
        return lf;
      }
      throw err;
    }
  }

  async write() {
    const body = `${JSON.stringify(this.toObject(), null, 2)}\n`;
    await writeFile(this.path, body, 'utf8');
  }

  async upsertEntry(args: { archive: AIpkgArchive; type: Manifest['type']; slug: string; parent?: string }) {
    const { archive, type, slug, parent } = args;
    const typeKey = Manifest.depsKey(type);

    const bucket = this.deps?.[typeKey] ?? {};
    const deps = this.deps ?? {};
    deps[typeKey] = bucket;
    this.deps = deps;

    const aipkgRef = archive.pkgRef.aipkgRef;

    const existing = bucket[slug];
    if (existing) {
      if (existing.sha === archive.sha && existing.version === archive.pkgRef.version) return;
      throw new Error(
        `lockfile deps conflict importing ${parent ?? aipkgRef}: ${typeKey} ${slug} already locked with a different archive`,
      );
    }

    bucket[slug] = {
      aipkgRef: aipkgRef,
      version: archive.pkgRef.version,
      sha: archive.sha,
      parent,
    };
  }

  async removeEntry(args: { type: Manifest['type']; slug: string }) {
    const { type, slug } = args;

    const typeKey = Manifest.depsKey(type);
    const bucket = this.deps?.[typeKey] ?? {};

    if (!bucket[slug]) return false;

    delete bucket[slug];

    return true;
  }

  /**
   * Collect the child deps of the root ref.
   */
  collectSubtree(args: { rootRef?: string }): {
    entries: Array<{ type: Manifest['type']; slug: string }>;
  } {
    const { rootRef } = args;

    // If no root ref is not provided, return an empty subtree. (DX)
    if (!rootRef) return { entries: [] };

    const deps = this.deps ?? {};

    const nodes: Array<{ type: Manifest['type']; slug: string; aipkgRef: string; parent?: string }> = [];
    for (const type of MANIFEST_TYPES) {
      const bucket = deps[Manifest.depsKey(type)];
      if (!bucket) continue;
      for (const [slug, entry] of Object.entries(bucket)) {
        nodes.push({ type, slug, aipkgRef: entry.aipkgRef, parent: entry.parent });
      }
    }

    const entries: Array<{ type: Manifest['type']; slug: string }> = [];
    const queue = [rootRef];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const parent = queue.shift();
      if (parent === undefined || seen.has(parent)) continue;
      seen.add(parent);

      for (const node of nodes) {
        if (node.parent !== parent) continue;
        entries.push({ type: node.type, slug: node.slug });
        queue.push(node.aipkgRef);
      }
    }

    return { entries };
  }

  resolvePkgRef(args: { pkgRef: PackageRef }): PackageRef {
    const { pkgRef } = args;

    const lock = this.getEntry({ pkgRef });

    if (!lock) return pkgRef;
    return new PackageRef({ refStr: lock.aipkgRef });
  }

  getEntry(args: { pkgRef: PackageRef }): LockEntry | undefined {
    const { pkgRef } = args;

    const key = pkgRef.entryKey();
    const typeKey = Manifest.depsKey(pkgRef.type);

    const bucket = this.deps?.[typeKey] ?? {};
    return bucket[key];
  }

  // Only one statusLine can be active across all installed setups, so the lockfile
  // tracks its single owner. A re-install by the same owner with the same config
  // is idempotent; any other claim is a conflict the install must reject.
  upsertStatusLine(args: { slug: string; statusLine: Record<string, unknown>; parent?: string }) {
    const { slug, statusLine, parent } = args;

    const deps = this.deps ?? {};
    this.deps = deps;

    const existing = deps.statusLine;
    if (existing) {
      const sameOwner = existing.slug === slug;
      const sameLine = stableStringify(existing.statusLine) === stableStringify(statusLine);
      if (sameOwner && sameLine) return;
      throw new Error(
        `lockfile statusLine conflict: statusLine is already claimed by "${existing.slug}"; "${slug}" also defines one — only one statusLine is allowed`,
      );
    }

    const locked: LockStatusLineEntry = { slug, statusLine };
    if (parent) locked.parent = parent;
    deps.statusLine = locked;
  }

  removeStatusLine(args: { slug: string }) {
    const { slug } = args;
    const deps = this.deps;
    if (!deps?.statusLine || deps.statusLine.slug !== slug) return false;
    deps.statusLine = undefined;
    return true;
  }

  getStatusLine(): LockStatusLineEntry | undefined {
    return this.deps?.statusLine;
  }

  toObject(): LockfileStruct {
    return { deps: this.deps };
  }
}

// A deterministic stringify (sorted keys, dropped `undefined`) so two statusLine
// objects that differ only in key order or absent fields compare equal.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
