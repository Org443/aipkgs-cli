import type { AIpkgArchive, Manifest } from '@local/archive';
import { Agent, type InstallResult, type RemoveResult } from '../../agent.abstract.ts';

export class CodexAgent extends Agent {
  async install(args: { archive: AIpkgArchive }): Promise<InstallResult> {
    throw new Error('Not implemented');
  }

  async remove(args: { type: Manifest['type']; refStr: string }): Promise<RemoveResult> {
    throw new Error('Not implemented');
  }
}
