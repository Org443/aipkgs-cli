import z from 'zod';
import {
  AGENT_TARGETS,
  type AgentTarget,
  DEPS_KEYS,
  type DepsKey,
  MANIFEST_TYPES,
  type ManifestType,
} from './constants.ts';
import { InvalidManifest } from './errors.ts';
import { PackageRef } from './ref.ts';

export const MANIFEST_FILENAME = 'aipkg.json';
export const MEMORY_FILENAME = 'CLAUDE.local.md';

type ManifestArgs = { text: string } | z.input<typeof ManifestZ>;

export type Repository = z.output<typeof RepositoryZ>;
export type Issues = z.output<typeof IssuesZ>;

export class Manifest {
  type: ManifestType;
  ref: string;
  version: string;
  description?: string;
  tags?: string[];
  targets?: AgentTarget[];
  homepage?: string;
  repository?: Repository;
  issues?: Issues;
  deps: {
    skills?: Record<string, PackageRef>;
    subagents?: Record<string, PackageRef>;
    rules?: Record<string, PackageRef>;
    setups?: Record<string, PackageRef>;
    boxes?: Record<string, PackageRef>;
  };
  pkgRef: PackageRef;

  constructor(args: { text: string });
  constructor(args: z.input<typeof ManifestZ>);
  constructor(args: ManifestArgs) {
    const obj = 'text' in args ? JSON.parse(args.text) : args;

    const result = ManifestZ.safeParse(obj);

    if (!result.success) {
      const pretty = z.prettifyError(result.error);
      throw new InvalidManifest({ message: pretty });
    }

    const { data } = result;
    this.type = data.type;
    this.ref = data.ref;
    this.version = data.version;
    this.description = data.description;
    this.tags = data.tags;
    this.targets = data.targets;
    this.homepage = data.homepage;
    this.repository = data.repository;
    this.issues = data.issues;
    this.deps = {};

    const fullRef = `${this.type}/${this.ref}@${this.version}`;
    this.pkgRef = new PackageRef({ refStr: fullRef });

    // Now we need to parse the skills, subagents, & rules entries
    for (const depKey of DEPS_KEYS) {
      const entries = data.deps?.[depKey];

      if (entries) {
        const bucket: Record<string, PackageRef> = {};
        for (const [alias, entry] of Object.entries(entries)) {
          bucket[alias] = new PackageRef({ refStr: entry });
        }

        this.deps[depKey] = bucket;
      }
    }
  }

  static empty(): Manifest {
    return new Manifest({
      type: 'box',
      ref: 'local/app',
      version: '0.0.0',
      targets: [],
    });
  }

  static depsKey(type: Manifest['type']): DepsKey {
    switch (type) {
      case 'skill':
        return 'skills';
      case 'subagent':
        return 'subagents';
      case 'rule':
        return 'rules';
      case 'setup':
        return 'setups';
      case 'box':
        return 'boxes';
    }
  }

  getEntry(args: { type: Manifest['type']; slug: string }) {
    const { type, slug } = args;
    const key = Manifest.depsKey(type);
    return this.deps[key]?.[slug];
  }

  hasDeps() {
    return DEPS_KEYS.some((key) => {
      const bucket = this.deps[key];
      return bucket && Object.keys(bucket).length > 0;
    });
  }

  bumpVersion(release: 'major' | 'minor' | 'patch') {
    this.version = nextVersion({ version: this.version, release });
    const fullRef = `${this.type}/${this.ref}@${this.version}`;
    this.pkgRef = new PackageRef({ refStr: fullRef });
    return this.version;
  }

  toObject(): z.output<typeof ManifestZ> {
    const deps = {
      skills: serializeBucket(this.deps.skills),
      subagents: serializeBucket(this.deps.subagents),
      rules: serializeBucket(this.deps.rules),
      setups: serializeBucket(this.deps.setups),
      boxes: serializeBucket(this.deps.boxes),
    };
    const hasAnyDep = Object.values(deps).some((v) => v !== undefined);
    return {
      type: this.type,
      ref: this.ref,
      version: this.version,
      description: this.description,
      tags: this.tags,
      targets: this.targets,
      homepage: this.homepage,
      repository: this.repository,
      issues: this.issues,
      deps: hasAnyDep ? deps : undefined,
    };
  }
}

function nextVersion(args: { version: string; release: 'major' | 'minor' | 'patch' }) {
  const { version, release } = args;
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`Cannot bump invalid version: ${version}`);

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (release) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

function serializeBucket(bucket: Record<string, PackageRef> | undefined): Record<string, string> | undefined {
  if (!bucket) return undefined;
  return Object.fromEntries(Object.entries(bucket).map(([alias, pkgRef]) => [alias, pkgRef.aipkgRef]));
}

export const RepositoryZ = z.object({
  type: z.string(),
  url: z.string(),
  directory: z.string().optional(),
});

export const IssuesZ = z.object({
  url: z.string().optional(),
  email: z.string().optional(),
});

const ManifestZ = z.object({
  type: z.enum(MANIFEST_TYPES),
  ref: z.string(),
  version: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).max(5).optional(),
  targets: z.array(z.enum(AGENT_TARGETS)).optional(),
  homepage: z.string().optional(),
  repository: RepositoryZ.optional(),
  issues: IssuesZ.optional(),
  deps: z
    .strictObject({
      skills: z.record(z.string(), z.string()).optional(),
      subagents: z.record(z.string(), z.string()).optional(),
      rules: z.record(z.string(), z.string()).optional(),
      setups: z.record(z.string(), z.string()).optional(),
      boxes: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});
