import { gunzipSync, gzipSync } from 'node:zlib';
import tar from 'tar-stream';

// Modes are normalized to 0o644 / 0o755 at pack time — only the executable bit
// survives packaging, so tarballs stay byte-identical regardless of the
// author's umask or group/other permissions.
export type TarEntry = { path: string; body: Buffer; executable?: boolean };

export const EXECUTABLE_MODE = 0o755;
export const REGULAR_FILE_MODE = 0o644;

// A file counts as executable if any execute bit (owner/group/other) is set.
export function isExecutableMode(mode: number) {
  return (mode & 0o111) !== 0;
}

// The normalized on-disk mode for an entry: only the executable bit is carried
// through, everything else is fixed so packaging is umask-independent.
export function determineExecMode(entry: { executable?: boolean }) {
  return entry.executable ? EXECUTABLE_MODE : REGULAR_FILE_MODE;
}

export const tarballService = {
  async unwrap(raw: Buffer) {
    const tarBuf = gunzipSync(raw);

    const { files } = await new Promise<{ files: TarEntry[] }>((res, rej) => {
      const files: TarEntry[] = [];
      const extract = tar.extract();

      extract.on('entry', (header, stream, next) => {
        if (header.type !== 'file') {
          stream.on('end', next);
          stream.resume();
          return;
        }

        const pathError = checkSafePath(header.name);
        if (pathError) {
          rej(pathError);
          extract.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => {
          const executable = isExecutableMode(header.mode ?? 0);
          files.push({ path: normalizePath(header.name), body: Buffer.concat(chunks), executable });
          next();
        });
      });

      extract.on('finish', () => res({ files }));

      extract.on('error', rej);
      extract.end(tarBuf); // using end(), we just use a single buffer pass to this and end.
    });

    return { files };
  },

  async pack(entries: TarEntry[]): Promise<Buffer> {
    return new Promise((res, rej) => {
      const pack = tar.pack();
      const chunks: Buffer[] = [];
      pack.on('data', (c: Buffer) => chunks.push(c));
      pack.on('end', () => {
        const concat = Buffer.concat(chunks);
        res(gzipSync(concat));
      });
      pack.on('error', rej);

      (async () => {
        for (const entry of entries) {
          const mode = determineExecMode(entry);
          await new Promise<void>((r, j) => {
            pack.entry({ name: entry.path, type: 'file', size: entry.body.length, mode }, entry.body, (err) =>
              err ? j(err) : r(),
            );
          });
        }
        pack.finalize();
      })().catch(rej);
    });
  },
};

function checkSafePath(path: string): Error | null {
  if (path.startsWith('/')) return new Error(`unsafe absolute path in archive: ${path}`);
  const segments = path.split('/');
  if (segments.some((s) => s === '..')) return new Error(`unsafe path traversal in archive: ${path}`);
  return null;
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '');
}
