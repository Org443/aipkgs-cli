#!/usr/bin/env node
// SessionStart hook for superpowers plugin

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptDir = __dirname;

let warningMessage = '';
const legacySkillsDir = path.join(os.homedir(), '.config', 'superpowers', 'skills');
if (fs.existsSync(legacySkillsDir)) {
  warningMessage =
    '\n\n<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:⚠️ **WARNING:** Superpowers now uses Claude Code\'s skills system. Custom skills in ~/.config/superpowers/skills will not be read. Move custom skills to ~/.claude/skills instead. To make this message go away, remove ~/.config/superpowers/skills</important-reminder>';
}

// Locate using-superpowers/SKILL.md. As a standalone hook package the skill is
// installed as a sibling under .claude/skills, but it may also be bundled (box
// layout) or installed at the user level — so probe candidates in priority order.
const rel = path.join('skills', 'using-superpowers', 'SKILL.md');
const candidates = [
  process.env.CLAUDE_PROJECT_DIR ? path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', rel) : '',
  path.join(process.cwd(), '.claude', rel),
  path.join(scriptDir, '..', '..', rel),
  path.join(os.homedir(), '.claude', rel),
];

let usingSuperpowersContent = '';
for (const candidate of candidates) {
  if (candidate && fs.existsSync(candidate)) {
    usingSuperpowersContent = fs.readFileSync(candidate, 'utf8');
    break;
  }
}

// Fall back to a minimal bootstrap if the skill isn't installed, so the hook
// still nudges toward skill discovery rather than emitting an error string.
if (!usingSuperpowersContent) {
  usingSuperpowersContent =
    "If any installed skill might apply to the user's request — even a 1% chance — invoke it with the Skill tool BEFORE responding. Process skills (brainstorming, debugging) come before implementation.";
}

const sessionContext =
  '<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n' +
  "**Below is the full content of your 'superpowers:using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n" +
  usingSuperpowersContent +
  '\n\n' +
  warningMessage +
  '\n</EXTREMELY_IMPORTANT>';

// Cursor hooks expect additional_context (snake_case).
// Claude Code hooks expect hookSpecificOutput.additionalContext (nested).
// Copilot CLI (v1.0.11+) and others expect additionalContext (top-level, SDK standard).
// Claude Code reads BOTH additional_context and hookSpecificOutput without
// deduplication, so we must emit only the field the current platform consumes.
let payload;
if (process.env.CURSOR_PLUGIN_ROOT) {
  payload = { additional_context: sessionContext };
} else if (!process.env.COPILOT_CLI && (process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDECODE)) {
  payload = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: sessionContext,
    },
  };
} else {
  payload = { additionalContext: sessionContext };
}

process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
