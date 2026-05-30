import { ConfirmPrompt } from '@clack/core';
import pc from 'picocolors';

// A yes/no confirmation prompt. ←/→ (or y/n) toggle the choice, Enter submits.
// Resolves to the chosen boolean, or false if the user cancels (Ctrl-C / Esc) —
// callers treat a cancel as "do not proceed".
export async function confirm(input: { message: string; initialValue?: boolean }): Promise<boolean> {
  const { message } = input;
  const initialValue = input.initialValue ?? true;

  const prompt = new ConfirmPrompt({
    active: 'yes',
    inactive: 'no',
    initialValue,
    render() {
      const head = `${pc.cyan('?')} ${pc.bold(message)}`;
      if (this.state === 'submit') return `${head} ${pc.green(this.value ? 'yes' : 'no')}`;
      if (this.state === 'cancel') return `${head} ${pc.dim('cancelled')}`;

      const yes = this.value ? pc.green(pc.bold('● yes')) : pc.dim('○ yes');
      const no = this.value ? pc.dim('○ no') : pc.green(pc.bold('● no'));
      return `${head} ${pc.dim('›')} ${yes} ${pc.dim('/')} ${no}`;
    },
  });

  const result = await prompt.prompt();
  if (prompt.state === 'cancel') return false;
  return result === true;
}
