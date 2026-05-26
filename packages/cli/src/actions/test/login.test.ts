import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../../services/auth.ts';
import { setupTestCwd, teardownTestCwd } from '../../test/helpers.ts';
import { loginAction } from '../login.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-login-test-' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
});

describe('loginAction', () => {
  it('prints the logged-in email on success', async () => {
    vi.spyOn(authService, 'login').mockResolvedValue({
      config: {} as any,
      credentials: { user: { id: 'u1', email: 'tester@example.com' } } as any,
    });

    await loginAction({ openBrowser: false });

    expect(authService.login).toHaveBeenCalledWith({ openBrowser: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('tester@example.com'));
  });

  it('exits with code 1 when login throws', async () => {
    vi.spyOn(authService, 'login').mockRejectedValue(new Error('state mismatch'));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(loginAction({ openBrowser: false })).rejects.toThrow('exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('login failed'));
  });
});
