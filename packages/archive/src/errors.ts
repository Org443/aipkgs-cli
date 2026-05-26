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
