import { stat } from 'node:fs/promises';
import { MANIFEST_FILENAME } from '@local/archive';
import pc from 'picocolors';
import { LOCKFILE_FILENAME, Lockfile } from '../files/lockfile.ts';
import { ManifestFile } from '../files/manifest.ts';
import { isENOENT } from '../io/fs.ts';

export async function initAction() {
  const manifestExisted = await fileExists(ManifestFile.resolvePath());
  const lockfileExisted = await fileExists(Lockfile.resolvePath());

  if (!manifestExisted) {
    // ManifestFile.read() writes an empty manifest when the file is missing.
    // Lockfile is intentionally NOT created here — it's only meaningful once
    // something is installed.
    await ManifestFile.resolve();
  }

  const headline =
    manifestExisted && lockfileExisted ? pc.yellow('Already initialized') : pc.green('Initialized aipkg');
  console.log(headline);

  if (manifestExisted) {
    console.log(`  ${pc.dim('·')} ${pc.bold(MANIFEST_FILENAME)} ${pc.dim('already exists')}`);
  } else {
    console.log(`  ${pc.green('+')} ${pc.bold(MANIFEST_FILENAME)} ${pc.dim('created')}`);
  }

  if (lockfileExisted) {
    console.log(`  ${pc.dim('·')} ${pc.bold(LOCKFILE_FILENAME)} ${pc.dim('already exists')}`);
  } else {
    console.log(`  ${pc.dim('·')} ${pc.bold(LOCKFILE_FILENAME)} ${pc.dim('will be created on first install')}`);
  }
}

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (isENOENT(err)) return false;
    throw err;
  }
}
