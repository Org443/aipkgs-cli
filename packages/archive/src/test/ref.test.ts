import { describe, expect, it } from 'vitest';
import { PackageRef } from '../ref.ts';

describe('PackageRef', () => {
  describe('from segment args', () => {
    it('constructs with all segments including key', () => {
      const ref = new PackageRef({ type: 'rule', org: 'acme', key: 'tools', slug: 'greet', version: '1.0.0' });

      expect(ref).toMatchObject({
        type: 'rule',
        org: 'acme',
        key: 'tools',
        slug: 'greet',
        version: '1.0.0',
        path: 'rule/acme/tools/greet/1.0.0',
        aipkgRef: 'aipkg://rule/acme/tools/greet@1.0.0',
      });
    });

    it('constructs without key (null)', () => {
      const ref = new PackageRef({ type: 'skill', org: 'acme', key: null, slug: 'deploy', version: 'latest' });

      expect(ref).toMatchObject({
        type: 'skill',
        org: 'acme',
        key: null,
        slug: 'deploy',
        version: 'latest',
        path: 'skill/acme/deploy/latest',
        aipkgRef: 'aipkg://skill/acme/deploy@latest',
      });
    });

    it('constructs without key (undefined)', () => {
      const ref = new PackageRef({ type: 'rule', org: 'org1', slug: 'lint', version: '2.1.0' });

      expect(ref.key).toBeUndefined();
      expect(ref.path).toBe('rule/org1/lint/2.1.0');
    });

    it('supports all valid package types', () => {
      const types = ['box', 'skill', 'subagent', 'rule', 'setup'] as const;
      for (const type of types) {
        const ref = new PackageRef({ type, org: 'org', key: null, slug: 'pkg', version: 'latest' });
        expect(ref.type).toBe(type);
      }
    });
  });

  describe('from refStr', () => {
    it('parses type/org/slug without version (defaults to latest)', () => {
      const ref = new PackageRef({ refStr: 'rule/acme/greet' });

      expect(ref).toMatchObject({
        type: 'rule',
        org: 'acme',
        key: null,
        slug: 'greet',
        version: 'latest',
        path: 'rule/acme/greet/latest',
      });
    });

    it('parses type/org/slug@version', () => {
      const ref = new PackageRef({ refStr: 'rule/acme/greet@1.0.0' });

      expect(ref).toMatchObject({
        type: 'rule',
        org: 'acme',
        key: null,
        slug: 'greet',
        version: '1.0.0',
        path: 'rule/acme/greet/1.0.0',
      });
    });

    it('parses type/org/key/slug without version (defaults to latest)', () => {
      const ref = new PackageRef({ refStr: 'rule/acme/tools/greet' });

      expect(ref).toMatchObject({
        type: 'rule',
        org: 'acme',
        key: 'tools',
        slug: 'greet',
        version: 'latest',
        path: 'rule/acme/tools/greet/latest',
      });
    });

    it('parses type/org/key/slug@version', () => {
      const ref = new PackageRef({ refStr: 'rule/acme/tools/greet@1.0.0' });

      expect(ref).toMatchObject({
        type: 'rule',
        org: 'acme',
        key: 'tools',
        slug: 'greet',
        version: '1.0.0',
        path: 'rule/acme/tools/greet/1.0.0',
      });
    });

    it('parses @latest as version', () => {
      const ref = new PackageRef({ refStr: 'skill/acme/deploy@latest' });

      expect(ref).toMatchObject({
        type: 'skill',
        org: 'acme',
        key: null,
        slug: 'deploy',
        version: 'latest',
      });
    });

    it('parses prerelease version', () => {
      const ref = new PackageRef({ refStr: 'box/myorg/core/bot@2.0.0-rc.1' });

      expect(ref).toMatchObject({
        type: 'box',
        org: 'myorg',
        key: 'core',
        slug: 'bot',
        version: '2.0.0-rc.1',
      });
    });

    it('strips aipkg:// protocol prefix', () => {
      const ref = new PackageRef({ refStr: 'aipkg://skill/acme/utils/deploy@2.1.0' });

      expect(ref).toMatchObject({
        type: 'skill',
        org: 'acme',
        key: 'utils',
        slug: 'deploy',
        version: '2.1.0',
      });
    });

    it('produces correct ref, path, and aipkgRef for a keyed ref', () => {
      const ref = new PackageRef({ refStr: 'box/myorg/core/bot@3.0.0' });

      expect(ref).toMatchObject({
        manifestRef: 'myorg/core/bot',
        path: 'box/myorg/core/bot/3.0.0',
        aipkgRef: 'aipkg://box/myorg/core/bot@3.0.0',
      });
    });

    it('produces correct ref, path, and aipkgRef for an unkeyed ref', () => {
      const ref = new PackageRef({ refStr: 'setup/superpowers/Superpowers@1.2.0' });

      expect(ref).toMatchObject({
        manifestRef: 'superpowers/Superpowers',
        path: 'setup/superpowers/Superpowers/1.2.0',
        aipkgRef: 'aipkg://setup/superpowers/Superpowers@1.2.0',
      });
    });
  });

  describe('appPath / apiPath', () => {
    it('returns correct app path', () => {
      const ref = new PackageRef({ type: 'rule', org: 'acme', key: null, slug: 'greet', version: '1.0.0' });
      expect(ref.appPath()).toBe('/packages/rules/acme/greet/1.0.0');
    });

    it('returns correct api path', () => {
      const ref = new PackageRef({ type: 'rule', org: 'acme', key: 'tools', slug: 'greet', version: '1.0.0' });
      expect(ref.apiPath()).toBe('/v1/packages/rule/acme/tools/greet/1.0.0');
    });
  });

  describe('validation errors', () => {
    it('rejects invalid type', () => {
      expect(
        () => new PackageRef({ type: 'invalid', org: 'acme', key: null, slug: 'greet', version: '1.0.0' }),
      ).toThrow('type is invalid');
    });

    it('rejects segment with invalid characters', () => {
      expect(() => new PackageRef({ type: 'rule', org: 'ac me', key: null, slug: 'greet', version: '1.0.0' })).toThrow(
        'invalid characters',
      );
    });

    it('rejects segment that is too long', () => {
      const longName = 'a'.repeat(31);
      expect(() => new PackageRef({ type: 'rule', org: longName, key: null, slug: 'greet', version: '1.0.0' })).toThrow(
        'segment too long',
      );
    });

    it('accepts segment at max length', () => {
      const maxName = 'a'.repeat(30);
      const ref = new PackageRef({ type: 'rule', org: maxName, key: null, slug: 'greet', version: '1.0.0' });
      expect(ref.org).toBe(maxName);
    });

    it('rejects invalid semver version', () => {
      expect(() => new PackageRef({ type: 'rule', org: 'acme', key: null, slug: 'greet', version: 'v1' })).toThrow(
        'version is invalid',
      );
    });

    it('accepts latest as version', () => {
      const ref = new PackageRef({ type: 'rule', org: 'acme', key: null, slug: 'greet', version: 'latest' });
      expect(ref.version).toBe('latest');
    });

    it('accepts semver with prerelease tag', () => {
      const ref = new PackageRef({ type: 'rule', org: 'acme', key: null, slug: 'greet', version: '1.0.0-beta.1' });
      expect(ref.version).toBe('1.0.0-beta.1');
    });

    it('rejects refStr with too few segments', () => {
      expect(() => new PackageRef({ refStr: 'rule/acme' })).toThrow('Invalid package reference');
    });

    it('rejects refStr with only one segment', () => {
      expect(() => new PackageRef({ refStr: 'rule' })).toThrow('Invalid package reference');
    });
  });
});
