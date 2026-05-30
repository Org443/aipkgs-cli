import { Prompt } from '@clack/core';
import pc from 'picocolors';

// A search-as-you-type prompt: as the user types a ref, matching packages are
// listed below the input (refreshed live + debounced — no Enter needed to
// search). ↑/↓ fill the input with the highlighted match; Enter submits whatever
// is currently in the input (typed or filled) so the caller can install it.
// Resolves to the input string, or null if the user cancels.
export interface AutocompleteChoice {
  value: string;
  label: string; // primary text shown in the list (the ref)
  hint?: string; // dimmed trailing text (the description)
}

export async function autocomplete(input: {
  message: string;
  kind?: string; // the package type, rendered as a per-row badge (e.g. "cmd")
  placeholder?: string;
  initialQuery?: string;
  source: (query: string) => Promise<AutocompleteChoice[]>;
  debounceMs?: number;
  maxResults?: number;
}): Promise<string | null> {
  const { message, placeholder, source } = input;
  const debounceMs = input.debounceMs ?? 200;
  const maxResults = input.maxResults ?? 8;

  let choices: AutocompleteChoice[] = [];
  let loading = false;
  let selected = -1; // -1 = editing the typed text; >=0 = a highlighted row
  let typedQuery = input.initialQuery ?? ''; // the last text the user actually typed
  let lastQuery = input.initialQuery ?? '';
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let seq = 0; // guards against out-of-order async responses

  const prompt = new Prompt(
    {
      // Seed the query so `aipkg cmd org443/fr` opens pre-filtered.
      initialUserInput: input.initialQuery,
      // track:true makes @clack/core mirror typed characters into
      // `this.userInput` (via the readline buffer) and maintain the text cursor
      // for us, firing a `userInput` event on every keystroke.
      render() {
        return renderFrame({
          message,
          kind: input.kind,
          query: String(this.userInput ?? ''),
          placeholder,
          choices,
          selected,
          loading,
          maxResults,
          state: this.state,
        });
      },
    },
    true,
  );

  const runSearch = (query: string) => {
    const mine = ++seq;
    loading = true;
    rerender(prompt);
    source(query)
      .then((next) => {
        if (mine !== seq) return; // a newer keystroke superseded this one
        choices = next;
        if (selected >= choices.length) selected = -1; // keep the highlight in range
        loading = false;
        rerender(prompt);
      })
      .catch(() => {
        if (mine !== seq) return;
        choices = [];
        selected = -1;
        loading = false;
        rerender(prompt);
      });
  };

  const scheduleSearch = (query: string) => {
    if (query === lastQuery) return;
    lastQuery = query;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(query), debounceMs);
  };

  // 'userInput' fires on every keystroke (track:true mirrors the readline buffer
  // into `prompt.userInput`). We can't flag that a change came from our own
  // arrow-fill, so we detect it: if the new value equals the highlighted row,
  // it's a fill — keep the selection. Otherwise the user typed, or edited the
  // arrow-filled ref, so leave navigation mode and search.
  prompt.on('userInput', (value) => {
    if (selected >= 0 && value === choices[selected]?.label) return;
    selected = -1;
    typedQuery = value;
    scheduleSearch(value);
  });

  // ↑/↓ move the highlight through the visible results and write the highlighted
  // ref into the input (←/→ stay free for editing the text). Going above the
  // first row restores whatever the user had typed.
  prompt.on('cursor', (key) => {
    if (key !== 'up' && key !== 'down') return;
    const navMax = Math.min(choices.length, maxResults) - 1;
    if (navMax < 0) return;
    if (key === 'down') selected = Math.min(selected + 1, navMax);
    else selected = selected <= 0 ? -1 : selected - 1;
    setInput(prompt, selected >= 0 ? (choices[selected]?.label ?? typedQuery) : typedQuery);
  });

  // Kick off the initial fetch from the seeded query.
  runSearch(input.initialQuery ?? '');

  await prompt.prompt();
  if (debounce) clearTimeout(debounce);

  // Enter submits the current input (typed or arrow-filled); Ctrl-C / Esc cancels.
  // The base Prompt only resolves `value` (which we never set), so read the
  // tracked text off `userInput` instead.
  if (prompt.state === 'cancel') return null;
  const value = prompt.userInput.trim();
  return value.length > 0 ? value : null;
}

////
/// Helpers
//

// @clack/core re-renders on its own keypress events but exposes no public hook
// to redraw after async data lands. `render` is private at the type level but a
// plain prototype method at runtime — calling it directly is how @clack's own
// prompts repaint, so we reach it through a cast.
function rerender(prompt: Prompt<unknown>) {
  (prompt as unknown as { render: () => void }).render();
}

// Programmatically replace the input contents (↑/↓ arrow-fill). @clack tracks
// typed text via the underlying readline buffer (`rl.line`) and re-reads it into
// `userInput` on the next keystroke, so we must update that buffer too — setting
// `userInput` alone would be overwritten on the next keypress, and would leave
// the user unable to edit the filled-in ref. `rl`/`_cursor` are private members
// reached through a cast.
function setInput(prompt: Prompt<unknown>, value: string) {
  const internal = prompt as unknown as {
    userInput: string;
    _cursor?: number;
    rl?: { line: string; cursor: number };
  };
  internal.userInput = value;
  if (internal.rl) {
    internal.rl.line = value;
    internal.rl.cursor = value.length;
  }
  if (typeof internal._cursor === 'number') internal._cursor = value.length;
  rerender(prompt);
}

function renderFrame(input: {
  message: string;
  kind?: string;
  query: string;
  placeholder?: string;
  choices: AutocompleteChoice[];
  selected: number;
  loading: boolean;
  maxResults: number;
  state: string;
}) {
  const { message, query, placeholder, choices, selected, loading, maxResults, state } = input;

  const head = `${pc.cyan('?')} ${pc.bold(message)}`;
  if (state === 'submit') return `${head} ${pc.green(query)}`;

  const typed = query.length > 0 ? query : pc.dim(placeholder ?? 'type a ref…');
  const lines: string[] = [`${head} ${pc.dim('›')} ${typed}`];
  lines.push(pc.dim('  ↑↓ pick · ↵ install · esc cancel'), '');

  if (loading && choices.length === 0) {
    lines.push(pc.dim('  searching…'));
  } else if (choices.length === 0) {
    lines.push(pc.dim(query ? '  no matches' : '  start typing to search'));
  } else {
    const descIndent = ' '.repeat(4);
    const visible = choices.slice(0, maxResults);
    for (let i = 0; i < visible.length; i++) {
      const choice = visible[i];
      if (!choice) continue;
      const active = i === selected;
      const pointer = active ? pc.green('❯') : pc.cyan('›');

      // Active ref = bold green (the standout); inactive = default weight.
      const label = active ? pc.green(pc.bold(choice.label)) : choice.label;
      lines.push(`${pointer} ${label}`);
      if (choice.hint) {
        const desc = truncate(choice.hint, 150);
        // Active description = gray (un-dimmed but mid-bright, below the ref);
        // inactive = dim.
        lines.push(`${descIndent}${active ? pc.italic(pc.dim(desc)) : pc.dim(desc)}`);
      }
    }
    if (choices.length > maxResults) {
      lines.push(pc.dim(`${descIndent}…${choices.length - maxResults} more`));
    }
  }

  return lines.join('\n');
}

// Trim a string to `max` characters total, using a trailing ellipsis (which
// counts toward the limit) when it had to be cut.
function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
