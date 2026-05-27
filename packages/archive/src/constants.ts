export const MANIFEST_TYPES = ['cmd', 'skill', 'subagent', 'rule', 'hook', 'box'] as const;
export const DEPS_KEYS = ['cmds', 'skills', 'subagents', 'rules', 'hooks', 'boxes'] as const;

export const AGENT_TARGETS = ['claude', 'codex'] as const;

export type ManifestType = (typeof MANIFEST_TYPES)[number];
export type DepsKey = (typeof DEPS_KEYS)[number];
export type AgentTarget = (typeof AGENT_TARGETS)[number];

export const MANIFEST_TYPE_TO_DEPS_KEY: Record<ManifestType, DepsKey> = {
  cmd: 'cmds',
  skill: 'skills',
  subagent: 'subagents',
  rule: 'rules',
  hook: 'hooks',
  box: 'boxes',
};
