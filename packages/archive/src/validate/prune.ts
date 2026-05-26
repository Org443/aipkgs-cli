import type { TarEntry } from '../tarball.ts';

const CRUFT_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitignore', '.gitattributes', '.npmignore']);

const CRUFT_DIR_SEGMENTS = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
]);

const CRUFT_EXTENSIONS = new Set(['.pyc', '.pyo', '.swp', '.swo', '.log']);

export function pruneCruft(files: TarEntry[]): TarEntry[] {
  return files.filter((file) => !isCruft(file.path));
}

function isCruft(path: string): boolean {
  const segments = path.split('/');
  const basename = segments[segments.length - 1] ?? '';

  if (CRUFT_BASENAMES.has(basename)) return true;

  for (const segment of segments) {
    if (CRUFT_DIR_SEGMENTS.has(segment)) return true;
  }

  const dotIdx = basename.lastIndexOf('.');
  if (dotIdx > 0) {
    const ext = basename.slice(dotIdx);
    if (CRUFT_EXTENSIONS.has(ext)) return true;
  }

  return false;
}
