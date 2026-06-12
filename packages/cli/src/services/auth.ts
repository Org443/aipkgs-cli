import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { platform } from 'node:os';
import pc from 'picocolors';
import { api } from '../api/index.ts';
import { ConfigFile } from '../files/config.ts';
import { type Credentials, CredentialsFile } from '../files/credentials.ts';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>aipkg · signed in</title>
<style>
  body { background:#0b0b0d; color:#e6e6e6; font-family: ui-monospace, Menlo, monospace; padding: 4rem; }
  h1 { font-size: 1.5rem; letter-spacing: 0.04em; }
  p { opacity: 0.7; }
</style></head>
<body><h1>aipkg · signed in</h1><p>You can close this tab and return to your terminal.</p></body>
</html>`;

const FAILURE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>aipkg · sign-in failed</title>
<style>body{background:#0b0b0d;color:#e6e6e6;font-family:ui-monospace,Menlo,monospace;padding:4rem}</style>
</head><body><h1>aipkg · sign-in failed</h1><p>Return to your terminal for details.</p></body>
</html>`;

export const authService = {
  async login(args: { openBrowser: boolean; timeoutMs?: number }) {
    const { openBrowser, timeoutMs } = args;
    const cliState = randomBytes(32).toString('base64url');
    const app = ConfigFile.appBase();

    const { port, awaitCallback, close } = await startLoopback();

    try {
      const startUrl = new URL('/cli/login', app);
      startUrl.searchParams.set('cli_state', cliState);
      startUrl.searchParams.set('cli_port', String(port));

      if (openBrowser) {
        const opened = openInBrowser(startUrl.toString());
        if (!opened) printManualUrl(startUrl.toString());
      } else {
        printManualUrl(startUrl.toString());
      }

      console.log(pc.dim('Waiting for browser sign-in...'));
      const { code, state } = await awaitCallback({ timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS });

      if (state !== cliState) {
        throw new Error('state mismatch — possible CSRF, aborting');
      }

      const { token, user } = await api.auth.exchange({ code, cliState });

      await CredentialsFile.setToken(token);
      await CredentialsFile.setUser({ id: user.id, email: user.email });

      const credentials = await CredentialsFile.resolve();
      return { credentials };
    } finally {
      close();
    }
  },

  async logout(): Promise<{ wasLoggedIn: boolean }> {
    const creds = await CredentialsFile.resolve();
    if (!creds.token) return { wasLoggedIn: false };

    await api.auth.signout({ token: creds.token });
    await CredentialsFile.delete();
    return { wasLoggedIn: true };
  },

  async whoami(): Promise<Credentials | null> {
    const creds = await CredentialsFile.resolve();
    if (!creds.token) return null;
    return creds;
  },
};

function openInBrowser(url: string): boolean {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  const args = platform() === 'win32' ? ['', url] : [url];

  try {
    const proc = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: platform() === 'win32' });
    proc.unref();
    return true;
  } catch {
    return false;
  }
}

function printManualUrl(url: string) {
  console.log(pc.dim('Open this URL in your browser:'));
  console.log(`  ${pc.cyan(url)}`);
}

type Loopback = {
  port: number;
  awaitCallback: (opts: { timeoutMs: number }) => Promise<{ code: string; state: string }>;
  close: () => void;
};

function startLoopback(): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    let pending: { resolve: (v: { code: string; state: string }) => void; reject: (err: Error) => void } | null = null;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/cb') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');

      if (!code || !state) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(FAILURE_HTML);
        pending?.reject(new Error('missing code or state on loopback callback'));
        pending = null;
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(SUCCESS_HTML);
      pending?.resolve({ code, state });
      pending = null;
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr || typeof addr === 'string') {
        reject(new Error('failed to bind loopback port'));
        return;
      }
      resolve({
        port: addr.port,
        awaitCallback: ({ timeoutMs }) =>
          new Promise((res, rej) => {
            const timer = setTimeout(() => {
              if (pending) {
                pending.reject(new Error('timed out waiting for browser sign-in'));
                pending = null;
              }
            }, timeoutMs);
            pending = {
              resolve: (v) => {
                clearTimeout(timer);
                res(v);
              },
              reject: (err) => {
                clearTimeout(timer);
                rej(err);
              },
            };
          }),
        close: () => {
          server.closeAllConnections();
          server.close();
        },
      });
    });
  });
}
