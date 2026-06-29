#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function gitOk(args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [branch, deleteFlag] = process.argv.slice(2);

if (!branch) {
  fail("Usage: ./worktree <branch-name> [-d]");
}

const repoRoot = resolve(dirname(git(["rev-parse", "--git-common-dir"])));
const repoName = basename(repoRoot);
const worktreeBase = join(dirname(repoRoot), `${repoName}.worktrees`);
const worktreePath = join(worktreeBase, branch);

if (deleteFlag === "-d") {
  console.log(`Removing worktree for branch '${branch}'...`);
  execFileSync("git", ["worktree", "remove", worktreePath], { stdio: "inherit" });
  console.log(`Done! Removed worktree at ${worktreePath}`);
  process.exit(0);
}

if (existsSync(worktreePath)) {
  fail(`Worktree already exists at ${worktreePath}`);
}

mkdirSync(worktreeBase, { recursive: true });

console.log(`Creating worktree for branch '${branch}' at ${worktreePath}...`);
if (gitOk(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])) {
  execFileSync("git", ["worktree", "add", worktreePath, branch], { stdio: "inherit" });
} else {
  execFileSync("git", ["worktree", "add", "-b", branch, worktreePath], { stdio: "inherit" });
}

const currentWorktree = git(["rev-parse", "--show-toplevel"]);
let envCount = 0;
for (const entry of readdirSync(currentWorktree, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.startsWith(".env")) continue;
  copyFileSync(join(currentWorktree, entry.name), join(worktreePath, entry.name));
  envCount++;
  console.log(`  Copied ${entry.name}`);
}

console.log(`Installing dependencies in ${worktreePath}...`);
execFileSync("npm", ["install", "--prefix", worktreePath], { stdio: "inherit" });

console.log(`Done! Copied ${envCount} .env file(s) to ${worktreePath}`);
