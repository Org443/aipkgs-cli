import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { MANIFEST_FILENAME, Manifest, type PackageRef } from '@local/archive';
import { isENOENT } from '../io/fs.ts';

export class ManifestFile extends Manifest {
  readonly path: string;

  constructor(args: { text: string; path: string }) {
    super({ text: args.text });
    this.path = args.path;
  }

  // Resolve a manifest file location. `file` may be an absolute path or a
  // filename/relative path (resolved against `dir` or cwd). Falls back to
  // `aipkg.json` in the working directory.
  static resolvePath({ dir, file }: { dir?: string; file?: string } = {}): string {
    if (file && isAbsolute(file)) return file;
    return join(dir ?? process.cwd(), file ?? MANIFEST_FILENAME);
  }

  // Read and parse the manifest at the resolved path. Throws if missing —
  // ENOENT propagates so callers can detect it via `isENOENT`.
  static async read({ dir, file }: { dir?: string; file?: string } = {}): Promise<ManifestFile> {
    const path = ManifestFile.resolvePath({ dir, file });
    const text = await readFile(path, 'utf8');
    return new ManifestFile({ text, path });
  }

  // Read the manifest if present, otherwise create + persist an empty agent
  // manifest at the resolved path and return it.
  static async resolve({ file }: { file?: string } = {}): Promise<ManifestFile> {
    const path = ManifestFile.resolvePath({ file });
    try {
      return await ManifestFile.read({ file: path });
    } catch (err) {
      if (isENOENT(err)) {
        const empty = Manifest.empty();
        const mf = new ManifestFile({ text: JSON.stringify(empty.toObject()), path });
        await mf.write();
        return mf;
      }
      throw err;
    }
  }

  async write() {
    const obj = this.toObject();
    const body = `${JSON.stringify(obj, null, 2)}\n`;
    await writeFile(this.path, body, 'utf8');
  }

  async upsertEntry(args: { pkgRef: PackageRef }) {
    const { pkgRef } = args;

    const slug = pkgRef.entryKey();

    const key = Manifest.depsKey(pkgRef.type);

    const assets = this.deps[key] ?? {};
    assets[slug] = pkgRef;
    this.deps[key] = assets;

    return { slug };
  }

  async removeEntry(args: { type: Manifest['type']; key: string }) {
    const { type, key } = args;

    const depKey = Manifest.depsKey(type);

    const deps = this.deps[depKey];
    if (!deps) return false;

    const pkgRef = deps[key];
    if (!pkgRef) return false;

    delete deps[key];
    this.deps[depKey] = deps;

    return true;
  }
}
