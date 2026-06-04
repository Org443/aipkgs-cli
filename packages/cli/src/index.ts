import { readFile } from 'node:fs/promises';
import { AGENT_TARGETS, type AgentTarget, MANIFEST_FILENAME, MANIFEST_TYPES, type Manifest } from '@local/archive';
import { Command } from 'commander';
import pc from 'picocolors';
import { ensureConfigured } from './actions/first-run.ts';
import { initAction } from './actions/init.ts';
import { installAllAction } from './actions/install/all.ts';
import { interactiveInstallAction } from './actions/install/interactive.ts';
import { loginAction } from './actions/login.ts';
import { logoutAction } from './actions/logout.ts';
import { mcpAddAction, mcpRemoveAction } from './actions/mcp.ts';
import { publishAction } from './actions/publish/publish.ts';
import { removeAction } from './actions/remove.ts';
import { isAgentTarget, promptTargets, setAipkgsMirrorAction, setTargetsAction } from './actions/set.ts';
import { whoamiAction } from './actions/whoami.ts';
import { HttpError } from './api/http.ts';
import { DEFAULT_VERSION } from './constants.ts';
import type { MirrorState } from './files/config.ts';

async function main() {
  const version = await readCliVersion();
  const program = new Command();

  program
    .name('aipkg')
    .description('Install and manage aipkg packages')
    .version(version, '-v, --version', 'output the version number')
    .showHelpAfterError();

  // Log the running CLI version before every command so it's visible in output
  // and bug reports. Runs ahead of the first-run gate so it covers every command.
  program.hook('preAction', async (_thisCommand, actionCommand) => {
    console.info(pc.dim(`v${version}`));

    // First-run gate: before any command runs, make sure an agent target is
    // configured (prompting once on a fresh install). Skipped for `set`, which is
    // the user explicitly configuring targets themselves.
    let top = actionCommand;
    while (top.parent && top.parent !== program) top = top.parent;
    if (top.name() === 'set') return;
    await ensureConfigured();
  });

  // Asset types: every type supports install (default) and remove.
  // Publishing for asset types is unified under `aipkg publish <type> <name>` below.
  for (const type of MANIFEST_TYPES) defineInstallCommand({ program, type });

  program
    .command('init')
    .description('Scaffold aipkg.json in the current directory (aipkg.lock is created on first install)')
    .action(async () => {
      await initAction();
    });

  program
    .command('login')
    .description('Sign in — pick your provider in the browser')
    .option('--no-browser', "don't auto-open a browser; print the URL instead")
    .action(async (opts: { browser: boolean }) => {
      await loginAction({ openBrowser: opts.browser });
    });

  program
    .command('logout')
    .description('Sign out and revoke the local API token')
    .action(async () => {
      await logoutAction();
    });

  program
    .command('whoami')
    .description('Show the currently signed-in account')
    .action(async () => {
      await whoamiAction();
    });

  program
    .command('install')
    .description('Install every dep declared in aipkg.json (verifies SHAs against aipkg.lock)')
    .option('-m, --manifest <path>', `path to the manifest file (defaults to ${MANIFEST_FILENAME} in cwd)`)
    .action(async (opts: { manifest?: string }) => {
      await installAllAction({ manifest: opts.manifest });
    });

  program
    .command('publish')
    .description(`Publish the package described by ${MANIFEST_FILENAME} (defaults to cwd)`)
    .argument(
      '[path]',
      `path to a manifest file, or a directory containing ${MANIFEST_FILENAME} (defaults to current working directory)`
    )
    .option('--dry', 'collect and print the manifest + archive contents without uploading')
    .option('-y, --yes', 'skip the interactive confirmation prompt and publish immediately')
    .action(async (path: string | undefined, opts: { dry?: boolean; yes?: boolean }) => {
      await publishAction({ path, dry: opts.dry, yes: opts.yes });
    });

  const mcpCmd = program.command('mcp').description('Manage MCP server entries in aipkg.json + .mcp.json');

  mcpCmd
    .command('add <slug>')
    .description('Add an MCP server (provide either --url or --command)')
    .option('--url <url>', 'HTTP MCP server URL')
    .option('--command <cmd>', 'stdio MCP server command')
    .option('--arg <value...>', 'argument to pass to the command (repeatable)')
    .option('--header <key=value...>', 'HTTP header (repeatable, requires --url)')
    .option('--env <key=value...>', 'environment variable (repeatable, requires --command)')
    .action(
      async (
        slug: string,
        opts: { url?: string; command?: string; arg?: string[]; header?: string[]; env?: string[] }
      ) => {
        await mcpAddAction({
          slug,
          url: opts.url,
          command: opts.command,
          args: opts.arg,
          headers: parseKeyVals(opts.header, '--header'),
          env: parseKeyVals(opts.env, '--env'),
        });
      }
    );

  mcpCmd
    .command('remove <slug>')
    .description('Remove an MCP server from aipkg.json, aipkg.lock, and .mcp.json')
    .action(async (slug: string) => {
      await mcpRemoveAction({ slug });
    });

  const setCmd = program.command('set').description('Update local aipkg configuration');

  setCmd
    .command('target [targets...]')
    .description(`Set the agent target(s) (${AGENT_TARGETS.join(', ')}) — omit args to pick interactively`)
    .action(async (targets: string[]) => {
      if (targets.length === 0) {
        const chosen = await promptTargets({ message: 'Select your agent target(s)' });
        if (chosen === null) {
          console.error(pc.red('Cancelled — targets unchanged.'));
          process.exit(1);
        }
        return;
      }

      const invalid = targets.filter((target) => !isAgentTarget(target));
      if (invalid.length > 0) {
        console.error(pc.red(`Invalid target(s) "${invalid.join(', ')}". Valid targets: ${AGENT_TARGETS.join(', ')}`));
        process.exit(1);
      }

      const unique = [...new Set(targets)] as AgentTarget[];
      await setTargetsAction({ targets: unique });
    });

  setCmd
    .command('mirror <state>')
    .description('Mirror installed archives into ./.aipkgs (enabled|disabled)')
    .action(async (state: string) => {
      const mirrorState = parseMirrorState(state);
      if (mirrorState === null) {
        console.error(pc.red(`Invalid state "${state}". Use "enabled" or "disabled".`));
        process.exit(1);
      }
      await setAipkgsMirrorAction({ state: mirrorState });
    });

  await program.parseAsync();
}

main().catch((err: unknown) => {
  let stack = '';
  if (err instanceof Error && err.stack) {
    stack = `\n${err.stack}`;
  }

  if (err instanceof HttpError) {
    console.error(pc.red(`error: ${err.message} (${err.url})${stack}`));
    process.exit(1);
  }

  console.error(pc.red(`error: ${err instanceof Error ? err.message : String(err)}${stack}`));
  process.exit(1);
});

////
/// Helper functions
//

function defineInstallCommand(input: { program: Command; type: Manifest['type'] }) {
  const { program, type } = input;
  const group = program
    .command(type)
    .description(`Search and install a ${type} package`)
    .argument('<ref>', 'full or partial <org>/<slug> — opens a live picker, then installs into cwd')
    .action(async (ref: string | undefined) => {
      if (!ref) {
        group.help();
        return;
      }

      await interactiveInstallAction({ type, ref });
    });

  group
    .command('remove <ref>')
    .description(`Uninstall a ${type} — accepts a ref ("acme/pr-create")`)
    .action(async (ref: string) => {
      await removeAction({ type, ref });
    });
}

// Read the CLI's own version from the package.json that ships with it. `index`
// sits one directory below package.json both in dev (src/index.ts) and in the
// published bundle (dist/index.js), so the same relative path resolves in both.
async function readCliVersion() {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const raw = await readFile(pkgUrl, 'utf8');
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? DEFAULT_VERSION;
}

function parseMirrorState(state: string): MirrorState | null {
  const normalized = state.trim().toLowerCase();
  if (normalized === 'enabled' || normalized === 'on') return 'enabled';
  if (normalized === 'disabled' || normalized === 'off') return 'disabled';
  return null;
}

function parseKeyVals(values: string[] | undefined, flag: string): Record<string, string> | undefined {
  if (!values || values.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const raw of values) {
    const eq = raw.indexOf('=');
    if (eq <= 0) throw new Error(`Invalid ${flag} "${raw}" — expected key=value`);
    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    out[key] = value;
  }
  return out;
}
