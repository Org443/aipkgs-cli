import { gunzipSync, gzipSync } from 'node:zlib';
import tar from 'tar-stream';

export type TarEntry = { path: string; body: Buffer };

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
          files.push({ path: normalizePath(header.name), body: Buffer.concat(chunks) });
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
          await new Promise<void>((r, j) => {
            pack.entry({ name: entry.path, type: 'file', size: entry.body.length }, entry.body, (err) =>
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
