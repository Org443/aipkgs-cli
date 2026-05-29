#!/usr/bin/env node

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(raw);

  const model = input.model?.display_name;
  const dir = input.workspace?.current_dir;
  const cost = Number(input.cost?.total_cost_usd ?? 0).toFixed(2);

  const usage = input.context_window?.current_usage ?? {};
  const tokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const budget = input.context_window?.context_window_size;

  let tokenInfo;
  if (budget) {
    const pct = ((tokens / budget) * 100).toFixed(1);
    const filled = Math.round((tokens / budget) * 20);
    const bar = "█".repeat(filled) + "░".repeat(Math.max(0, 20 - filled));
    tokenInfo = `[${bar}] ${pct}%`;
  } else {
    tokenInfo = `${tokens}`;
  }

  const baseUrl = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  process.stdout.write(
    `${model} | ${dir} | Context: ${tokenInfo} | Cost: $${cost} | ${baseUrl}`,
  );
});
