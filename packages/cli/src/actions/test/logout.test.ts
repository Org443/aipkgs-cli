import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../../services/auth.ts';
import { setupTestCwd, teardownTestCwd } from '../../test/helpers.ts';
import { logoutAction } from '../logout.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-logout-test-' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
});

describe('logoutAction', () => {
  it('prints "Signed out." when a token was present', async () => {
    vi.spyOn(authService, 'logout').mockResolvedValue({ wasLoggedIn: true });

    await logoutAction();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Signed out'));
  });

  it('prints "Not logged in." when no token was present', async () => {
    vi.spyOn(authService, 'logout').mockResolvedValue({ wasLoggedIn: false });

    await logoutAction();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
  });
});
