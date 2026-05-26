import type { Target } from '../types.ts';

function unsupported(): never {
  throw new Error('Target "codex" is not yet supported.');
}

export const codexTarget: Target = {
  async install() {
    unsupported();
  },
  async installFiles() {
    unsupported();
  },
  async remove() {
    unsupported();
  },
  async installMcp() {
    unsupported();
  },
  async removeMcp() {
    unsupported();
  },
};
