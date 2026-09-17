import { describe, expect, it } from 'vitest';
import { studyBranch, studyPath, studySlug } from '../src/core/slug.js';

describe('study slug', () => {
  it('lowercases and joins owner/name with __', () => {
    expect(studySlug('Acme-AI/Agent-Kit')).toBe('acme-ai__agent-kit');
    expect(studyBranch('Acme-AI/Agent-Kit')).toBe('study/acme-ai__agent-kit');
    expect(studyPath('Acme-AI/Agent-Kit')).toBe('studies/acme-ai__agent-kit.md');
  });

  it('maps case variants of the same repository to one slug', () => {
    expect(studySlug('OWNER/Repo')).toBe(studySlug('owner/repo'));
  });

  it('keeps dots and underscores', () => {
    expect(studySlug('my_org/next.js')).toBe('my_org__next.js');
  });

  it('rejects invalid ids and path traversal', () => {
    for (const bad of ['no-slash', 'a/b/c', '../x', 'a/..', 'a/b c', '']) {
      expect(() => studySlug(bad)).toThrow(/Invalid repository id/);
    }
  });
});
