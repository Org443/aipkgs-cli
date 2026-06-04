import { AGENT_TARGETS, type AgentTarget } from '@local/archive';
import pc from 'picocolors';
import { multiselect } from '../autocomplete/multiselect.ts';
import { ConfigFile, type MirrorState } from '../files/config.ts';

const TARGET_HINTS: Record<AgentTarget, string> = {
  claude: 'Claude Code — ~/.claude, .claude/',
  codex: 'Codex — ~/.codex, .codex/',
};

export async function setTargetsAction({ targets }: { targets: AgentTarget[] }) {
  await ConfigFile.setTargets(targets);
  console.log(pc.green(`Target${targets.length === 1 ? '' : 's'} set to ${pc.bold(targets.join(', '))}.`));
}

export async function setAipkgsMirrorAction({ state }: { state: MirrorState }) {
  await ConfigFile.setAipkgsMirror(state);
  console.log(pc.green(`Archive mirror (${pc.bold('.aipkgs/')}) ${state}.`));
}

// Open the interactive agent picker, save the chosen targets (printing the
// confirmation via setTargetsAction), and return them. Returns null if the user
// cancels (Ctrl-C / Esc) — callers leave config untouched.
export async function promptTargets(input: { message: string }): Promise<AgentTarget[] | null> {
  const current = await ConfigFile.resolve();
  const options = AGENT_TARGETS.map((value) => ({ value, label: value, hint: TARGET_HINTS[value] }));
  const chosen = await multiselect<AgentTarget>({
    message: input.message,
    options,
    initialValues: current.targets ?? [],
  });
  if (chosen === null) return null;
  await setTargetsAction({ targets: chosen });
  return chosen;
}

export function isAgentTarget(value: string): value is AgentTarget {
  return (AGENT_TARGETS as readonly string[]).includes(value);
}
