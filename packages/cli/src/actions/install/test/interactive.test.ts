import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api } from '../../../api/index.ts';
import { autocomplete } from '../../../autocomplete/autocomplete.ts';
import { installAction } from '../install.ts';
import { interactiveInstallAction } from '../interactive.ts';

vi.mock('../install.ts', () => ({ installAction: vi.fn() }));
vi.mock('../../../autocomplete/autocomplete.ts', () => ({ autocomplete: vi.fn() }));

let search: MockInstance<typeof api.packages.search>;

function setTTY(isTTY: boolean) {
  Object.defineProperty(process.stdout, 'isTTY', { value: isTTY, configurable: true });
}

beforeEach(() => {
  search = vi.spyOn(api.packages, 'search');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  setTTY(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('interactiveInstallAction', () => {
  it('installs the literal ref without searching in a non-TTY', async () => {
    setTTY(false);

    await interactiveInstallAction({ type: 'cmd', ref: 'org443/pr-create' });

    expect(search).not.toHaveBeenCalled();
    expect(autocomplete).not.toHaveBeenCalled();
    expect(installAction).toHaveBeenCalledWith({ type: 'cmd', ref: 'org443/pr-create' });
  });

  it('skips the picker when the single match equals the ref exactly', async () => {
    search.mockResolvedValue([{ type: 'cmd', ref: 'org443/pr-create', description: '' }]);

    await interactiveInstallAction({ type: 'cmd', ref: 'org443/pr-create' });

    expect(autocomplete).not.toHaveBeenCalled();
    expect(installAction).toHaveBeenCalledWith({ type: 'cmd', ref: 'org443/pr-create' });
  });

  it('preserves a pinned version when the single match equals the bare ref', async () => {
    search.mockResolvedValue([{ type: 'cmd', ref: 'org443/pr-create', description: '' }]);

    await interactiveInstallAction({ type: 'cmd', ref: 'org443/pr-create@1.1.1' });

    expect(autocomplete).not.toHaveBeenCalled();
    expect(installAction).toHaveBeenCalledWith({ type: 'cmd', ref: 'org443/pr-create@1.1.1' });
  });

  it('opens the picker when a single prefix match does not equal the ref', async () => {
    search.mockResolvedValue([{ type: 'cmd', ref: 'org443/prettier', description: '' }]);
    vi.mocked(autocomplete).mockResolvedValue('org443/prettier');

    await interactiveInstallAction({ type: 'cmd', ref: 'org443/pr' });

    expect(autocomplete).toHaveBeenCalledOnce();
    expect(installAction).toHaveBeenCalledWith({ type: 'cmd', ref: 'org443/prettier' });
  });

  it('opens the picker when more than one package matches', async () => {
    search.mockResolvedValue([
      { type: 'cmd', ref: 'org443/pr-create', description: '' },
      { type: 'cmd', ref: 'org443/pr-review', description: '' },
    ]);
    vi.mocked(autocomplete).mockResolvedValue('org443/pr-review');

    await interactiveInstallAction({ type: 'cmd', ref: 'org443/pr' });

    expect(autocomplete).toHaveBeenCalledOnce();
    expect(installAction).toHaveBeenCalledWith({ type: 'cmd', ref: 'org443/pr-review' });
  });

  it('does nothing when the picker is cancelled', async () => {
    search.mockResolvedValue([]);
    vi.mocked(autocomplete).mockResolvedValue(null);

    await interactiveInstallAction({ type: 'cmd', ref: 'org443/nope' });

    expect(installAction).not.toHaveBeenCalled();
  });
});
