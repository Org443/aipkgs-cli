import type { Manifest } from '@local/archive';
import pc from 'picocolors';
import { api } from '../../api/index.ts';
import { autocomplete } from '../../autocomplete/autocomplete.ts';
import { installAction } from './install.ts';

// `aipkg <type> <ref>` drops into a live picker seeded with <ref>: as you type,
// it prefix-searches the registry and installs the highlighted package on Enter.
// In a non-TTY (CI, pipes) there's nothing to drive the picker, so we install
// the literal ref directly and never block.
export async function interactiveInstallAction(args: { type: Manifest['type']; ref: string }) {
  const { type, ref } = args;

  if (!process.stdout.isTTY) {
    await installAction({ type, ref });
    return;
  }

  // If the ref already pins down exactly one package there's nothing to
  // disambiguate — skip the picker and install it straight away. limit:2 is
  // enough to distinguish "exactly one" from "more than one".
  const matches = await api.packages.search({ type, partial: ref, limit: 2 });
  const onlyMatch = matches.length === 1 ? matches[0] : undefined;
  if (onlyMatch) {
    await installAction({ type, ref: onlyMatch.ref });
    return;
  }

  const picked = await autocomplete({
    message: `Install ${type}`,
    kind: type,
    placeholder: 'org/slug',
    initialQuery: ref,
    source: async (partial) => {
      const results = await api.packages.search({ type, partial, limit: 12 });
      return results.map((r) => ({ value: r.ref, label: r.ref, hint: r.description }));
    },
  });

  if (!picked) {
    console.log(pc.dim('Cancelled.'));
    return;
  }

  await installAction({ type, ref: picked });
}
