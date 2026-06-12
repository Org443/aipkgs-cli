export function isENOENT(err: unknown) {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT';
}

export class InvalidArchive extends Error {
  constructor(args: { message: string }) {
    const { message } = args;
    super(`Invalid archive: ${message}`);
    this.name = 'InvalidArchive';
  }
}

export class InvalidManifest extends Error {
  constructor(args: { message: string }) {
    const { message } = args;
    super(`Invalid manifest: ${message}`);
    this.name = 'InvalidManifest';
  }
}
