import { authApi } from './auth.ts';
import { packages } from './packages.ts';

export const api = {
  packages,
  auth: authApi,
};

export type { ExchangedSession } from './auth.ts';
