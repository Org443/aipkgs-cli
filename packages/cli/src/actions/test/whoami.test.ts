import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../../services/auth.ts';
import { setupTestCwd, teardownTestCwd } from '../../test/helpers.ts';
import { whoamiAction } from '../whoami.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-whoami-test-' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
});

describe('whoamiAction', () => {
  it('prints the user email when logged in', async () => {
    vi.spyOn(authService, 'whoami').mockResolvedValue({
      token: 'test-token',
      user: { id: 'u1', email: 'tester@example.com' },
    } as any);

    await whoamiAction();

    expect(console.log).toHaveBeenCalledWith('tester@example.com');
  });

  it('prints "Not logged in." when no credentials exist', async () => {
    vi.spyOn(authService, 'whoami').mockResolvedValue(null);

    await whoamiAction();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
  });
});
