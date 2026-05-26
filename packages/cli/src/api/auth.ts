import { ConfigFile } from '../files/config.ts';
import { ensureOk } from './http.ts';

export type ExchangedSession = { token: string; user: { id: string; email: string } };

export const authApi = {
  async exchange({ code, cliState }: { code: string; cliState: string }): Promise<ExchangedSession> {
    const url = new URL('/auth/cli/exchange', ConfigFile.apiBase()).toString();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cli_state: cliState }),
    });
    await ensureOk(res);

    return (await res.json()) as ExchangedSession;
  },

  // Best-effort: swallows network errors so the caller can still drop local
  // credentials when the server is unreachable.
  async signout({ token }: { token: string }): Promise<void> {
    const url = new URL('/auth/signout', ConfigFile.apiBase()).toString();
    try {
      await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // ignore — local logout still proceeds
    }
  },
};
