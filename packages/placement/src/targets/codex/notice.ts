// Surfaces a `codex:` notice for asset surfaces the Codex target recognizes but
// does not place (e.g. a bundled status line). These no-op rather than throw so a
// multi-target install that includes Codex still succeeds.
export function codexNotice(message: string) {
  console.warn(`codex: ${message}`);
}
