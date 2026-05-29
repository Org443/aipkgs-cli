import { MANIFEST_TYPES, MANIFEST_TYPE_TO_DEPS_KEY } from './constants.ts';
import type { Manifest } from './manifest.ts';

type SegmentArgs = { type: string; org: string; key?: string | null; slug: string; version: string };
type Args = SegmentArgs | { refStr: string };

export class PackageRef {
  type: Manifest['type'];
  org: string;
  key?: string | null | undefined;
  slug: string;
  aipkgRef: string;
  path: string;
  version: string;
  manifestRef: string;

  constructor(args: SegmentArgs);
  constructor(args: { refStr: string });
  constructor(args: Args) {
    const { type, org, key, slug, version } = 'refStr' in args ? extractSegments({ ref: args.refStr }) : args;

    assertType(type);
    assertSegment(org);
    assertSegment(key);
    assertSegment(slug);
    assertVersion(version);

    const { ref, path, aipkgRef } = composeSegments({ type, org, key, slug, version });

    this.type = type;
    this.org = org;
    this.key = key;
    this.slug = slug;
    this.manifestRef = ref;
    this.aipkgRef = aipkgRef;
    this.path = path;
    this.version = version;
  }

  // The key a package is tracked under in the manifest, lockfile, and on disk.
  // Hooks and boxes are namespaced by their full ref (org/key?/slug); every
  // other type lives in a flat directory keyed by the bare slug.
  entryKey(): string {
    if (this.type === 'hook' || this.type === 'box') return this.manifestRef;
    return this.slug;
  }

  appPath(): string {
    const assetKey = MANIFEST_TYPE_TO_DEPS_KEY[this.type];
    const rest = [this.org, this.key, this.slug, this.version].filter(Boolean).join('/');
    return `/packages/${assetKey}/${rest}`;
  }
  apiPath(): string {
    return `/v1/packages/${this.path}`;
  }
}

function composeSegments(args: SegmentArgs) {
  const { type, org, key, slug, version } = args;
  // `ref` is the namespaced identifier without the type (org/key?/slug);
  // `path` and `aipkgRef` carry the type so they round-trip to the registry.
  const ref = [org, key, slug].filter(Boolean).join('/');
  const typedRef = `${type}/${ref}`;
  const path = `${typedRef}/${version}`;
  const aipkgRef = `aipkg://${typedRef}@${version}`;
  return { ref, path, aipkgRef };
}

function extractSegments(args: { ref: string }) {
  const { ref } = args;
  const refStr = ref.replace('aipkg://', '');

  const [pathPart, versionPart] = refStr.split('@');
  const version = versionPart || 'latest';

  if (!pathPart) throw new Error('Invalid package reference, path is required');

  const parts = pathPart.split('/');
  if (parts.length < 3 || parts.length > 4) {
    throw new Error('Invalid package reference');
  }

  let type: string;
  let org: string;
  let key: string | null;
  let slug: string;

  if (parts.length === 4) {
    [type, org, key, slug] = parts as [string, string, string, string];
  } else {
    [type, org, slug] = parts as [string, string, string];
    key = null;
  }

  if (!type) throw new Error('Invalid package reference, type is required');
  if (!org) throw new Error('Invalid package reference, org is required');
  if (!slug) throw new Error('Invalid package reference, slug is required');

  return { type, org, key, slug, version };
}

const SEGMENT = /^[a-z0-9-_]*$/i;
const MAX_SEGMENT_LENGTH = 30;
function assertSegment(segment: string | null | undefined) {
  if (segment === null || segment === undefined) return;

  if (segment.length > MAX_SEGMENT_LENGTH) {
    throw new Error(`Invalid package reference, segment too long: ${segment}`);
  }

  if (!SEGMENT.test(segment)) {
    throw new Error(`Invalid package reference, segment contains invalid characters: ${segment}`);
  }

  return true;
}

function assertType(type: string): asserts type is Manifest['type'] {
  if (!MANIFEST_TYPES.includes(type as (typeof MANIFEST_TYPES)[number])) {
    throw new Error(`Invalid package reference, type is invalid. Must be one of: ${MANIFEST_TYPES.join(', ')}`);
  }
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
function assertVersion(version: string) {
  if (version === 'latest') return;

  if (!SEMVER_RE.test(version)) {
    throw new Error('Invalid package reference, version is invalid');
  }
}
