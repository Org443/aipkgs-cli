import { MultiSelectPrompt } from '@clack/core';
import pc from 'picocolors';

export interface MultiSelectOption<T> {
  value: T;
  label: string;
  hint?: string; // dimmed trailing text
}

// A checkbox list: ↑/↓ move the cursor, space toggles the row, Enter submits.
// At least one selection is required — Enter with nothing checked re-prompts.
// Resolves to the chosen values, or null if the user cancels (Ctrl-C / Esc).
export async function multiselect<T>(input: {
  message: string;
  options: MultiSelectOption<T>[];
  initialValues?: T[];
}): Promise<T[] | null> {
  const { message, options } = input;

  const prompt = new MultiSelectPrompt<{ value: T; label: string }>({
    options: options.map((option) => ({ value: option.value, label: option.label })),
    initialValues: input.initialValues ?? [],
    // Reject an empty selection so callers always receive at least one value.
    validate(value) {
      if (!value || value.length === 0) return 'Select at least one — press space to toggle.';
      return undefined;
    },
    render() {
      const head = `${pc.cyan('?')} ${pc.bold(message)}`;
      const value = (this.value ?? []) as T[];

      if (this.state === 'submit') {
        const labels = value.map((v) => labelFor({ options, value: v }));
        return `${head} ${pc.green(labels.join(', '))}`;
      }
      if (this.state === 'cancel') return `${head} ${pc.dim('cancelled')}`;

      const selected = new Set(value);
      const lines = [head, pc.dim('  ↑↓ move · space toggle · ↵ confirm · esc cancel'), ''];
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (!option) continue;
        const active = i === this.cursor;
        const box = selected.has(option.value) ? pc.green('◼') : pc.dim('◻');
        const pointer = active ? pc.green('❯') : ' ';
        const label = active ? pc.green(pc.bold(option.label)) : option.label;
        const hint = option.hint ? ` ${pc.dim(option.hint)}` : '';
        lines.push(`${pointer} ${box} ${label}${hint}`);
      }
      if (this.error) lines.push('', pc.yellow(this.error));
      return lines.join('\n');
    },
  });

  const result = await prompt.prompt();
  if (prompt.state === 'cancel') return null;
  return result as T[];
}

////
/// Helpers
//

function labelFor<T>(input: { options: MultiSelectOption<T>[]; value: T }) {
  const match = input.options.find((option) => option.value === input.value);
  return match?.label ?? String(input.value);
}
