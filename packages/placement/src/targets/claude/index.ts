import type { Target } from '../types.ts';
import { install, installFiles, remove } from './install.ts';
import { installMcp, removeMcp } from './mcp.ts';
import { settingsConfig } from './settings-config.ts';

export const claudeTarget: Target = {
  install,
  installFiles,
  remove,
  installMcp,
  removeMcp,
  setStatusLine: settingsConfig.setStatusLine,
  clearStatusLine: settingsConfig.clearStatusLine,
};
