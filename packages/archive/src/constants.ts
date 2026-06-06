export const MANIFEST_TYPES = ['skill', 'subagent', 'rule', 'setup', 'box'] as const;
export const DEPS_KEYS = ['skills', 'subagents', 'rules', 'setups', 'boxes'] as const;

export const AGENT_TARGETS = ['claude', 'codex'] as const;

export type ManifestType = (typeof MANIFEST_TYPES)[number];
export type DepsKey = (typeof DEPS_KEYS)[number];
export type AgentTarget = (typeof AGENT_TARGETS)[number];

export const MANIFEST_TYPE_TO_DEPS_KEY: Record<ManifestType, DepsKey> = {
  skill: 'skills',
  subagent: 'subagents',
  rule: 'rules',
  setup: 'setups',
  box: 'boxes',
};
