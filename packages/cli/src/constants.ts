import type { AgentTarget } from '@local/archive';

export const DEFAULT_AGENT_TARGET: AgentTarget = 'claude';
export const DEFAULT_VERSION = '0.0.0';

// Single-segment identifier (alias names, slug fragments). Mirrors the shared
// SEGMENT regex but stays inline since it's a CLI-input concern.
export const SEGMENT = /^[a-z0-9-_]+$/i;
