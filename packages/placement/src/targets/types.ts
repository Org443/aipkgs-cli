import type { AIpkgArchive, Manifest, McpEntry, TarEntry } from '@local/archive';

export type Target = {
  install(args: {
    archive: AIpkgArchive;
    slug: string;
  }): Promise<{ written: string[]; statusLine?: Record<string, unknown> }>;
  installFiles(args: {
    type: Manifest['type'];
    slug: string;
    files: TarEntry[];
  }): Promise<{ written: string[]; statusLine?: Record<string, unknown> }>;
  remove(args: { type: Manifest['type']; slug: string }): Promise<{ path: string }>;
  installMcp(args: { slug: string; entry: McpEntry }): Promise<{ written: string[] }>;
  removeMcp(args: { slug: string }): Promise<{ removed: boolean; path: string }>;
  setStatusLine(args: { slug: string; statusLine: Record<string, unknown> }): Promise<{ path: string }>;
  clearStatusLine(): Promise<{ removed: boolean; path: string }>;
};
