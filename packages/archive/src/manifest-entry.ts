import { z } from 'zod';

export const McpEntryZ = z.object({
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export type McpEntry = z.output<typeof McpEntryZ>;
