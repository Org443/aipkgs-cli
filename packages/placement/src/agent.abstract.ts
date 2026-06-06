import type { AIpkgArchive, Manifest } from '@local/archive';

export type InstallResult = {
  paths: string[];
  deps: { type: Manifest['type']; slug: string }[];
};

export type RemoveResult = {
  paths: string[];
  deps: { type: Manifest['type']; slug: string }[];
};

export abstract class Agent {
  /**
   * This installs an archive into the agent resources.
   * The archive could be of type skill, rule, subagent, box, or hook. (these archives could have config changes (side effects): status lines, mcps, etc...)
   * Internally the agent will need to route the installation based on the archive type.
   */
  abstract install(args: { archive: AIpkgArchive }): Promise<InstallResult>;

  /**
   * This removes an archive from the agent resources.
   * The archive could be of type skill, rule, subagent, box, or hook.
   * Internally the agent will need to route the removal based on the archive type.
   * `refStr` is the on-disk entry key — a bare slug for flat types, or the
   * namespaced `org/key?/slug` ref for hooks/boxes (i.e. `PackageRef.entryKey()`).
   */
  abstract remove(args: { type: Manifest['type']; refStr: string }): Promise<RemoveResult>;
}
