export async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  throw await readErrorMessage(res);
}

async function readErrorMessage(res: Response): Promise<HttpError> {
  const text = await res.text().catch(() => '');
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as { error?: string; message?: string };
        return new HttpError({ status: res.status, message: obj.error ?? obj.message ?? text });
      }
    } catch {
      // Not JSON — fall through and surface the raw body.
    }
    return new HttpError({ status: res.status, message: text });
  }
  return new HttpError({ status: res.status, message: res.statusText || `HTTP ${res.status}` });
}

export class HttpError extends Error {
  override name = 'HttpError';
  readonly status: number;
  constructor(args: { status: number; message: string }) {
    const { status, message } = args;
    super(message);
    this.status = status;
  }
}
