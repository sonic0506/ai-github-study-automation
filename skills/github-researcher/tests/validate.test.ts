import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createValidator, type SchemaValidator } from '../../../src/core/schema.js';
import type { ResearchNote } from '../../../src/core/types.js';
import { checkResearchNote, collectSourceRefs } from '../scripts/validate.js';

const root = new URL('../../../', import.meta.url);
const readJson = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(p, root)), 'utf8'));
const fixture = (name: string): ResearchNote => readJson(`skills/github-researcher/tests/fixtures/${name}.json`);
const clone = (n: ResearchNote): ResearchNote => structuredClone(n);

let v: SchemaValidator;
beforeAll(() => {
  v = createValidator(['repository', 'registry', 'research-note'].map((n) => readJson(`schemas/${n}.schema.json`)));
});

describe('checkResearchNote', () => {
  it('accepts the example note', () => {
    const r = checkResearchNote(fixture('valid-note'), v);
    expect(r).toMatchObject({ ok: true, errors: [], warnings: [] });
    expect(r.stats).toEqual({ facts: 3, sources: 4, referencedSources: 4, sourceTypes: ['docs', 'issues', 'readme', 'release'] });
  });

  it('accepts a not-studyable note with judgment only', () => {
    expect(checkResearchNote(fixture('not-studyable-note'), v)).toMatchObject({ ok: true, errors: [] });
  });

  it('rejects unknown source ids and duplicate source ids', () => {
    const r = checkResearchNote(fixture('invalid-note'), v);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('sources: duplicate id "s1"');
    expect(r.errors).toContain('facts[0]: unknown source id "s9"');
  });

  it('reports unknown ids with their path for every sourced section', () => {
    const note = clone(fixture('valid-note'));
    note.architecture![0]!.sourceIds = ['s7'];
    note.gettingStarted!.sourceIds = ['s8'];
    note.limitations![0]!.sourceIds = ['s1', 's9'];
    const r = checkResearchNote(note, v);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'architecture[0]: unknown source id "s7"',
        'gettingStarted: unknown source id "s8"',
        'limitations[0]: unknown source id "s9"',
      ]),
    );
  });

  it('requires the research sections when studyable', () => {
    const note = clone(fixture('valid-note'));
    delete note.facts;
    expect(checkResearchNote(note, v).errors.some((e) => e.includes("required property 'facts'"))).toBe(true);
  });

  it('requires at least three facts and two sources via schema', () => {
    const note = clone(fixture('valid-note'));
    note.facts = note.facts!.slice(0, 1);
    note.sources = note.sources!.slice(0, 1);
    const r = checkResearchNote(note, v);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/fewer than 3 items|minItems|must NOT have fewer/);
  });

  it('warns about unreferenced sources, readme-only research and missing gettingStarted', () => {
    const note = clone(fixture('valid-note'));
    note.sources = note.sources!.filter((s) => s.type === 'readme');
    note.architecture = [];
    note.keyFeatures = [{ name: 'a', detail: 'b', sourceIds: ['s1'] }];
    note.recentReleases = [];
    note.communitySignals = [];
    note.limitations = [];
    note.facts = note.facts!.map((f) => ({ ...f, sourceIds: ['s1'] }));
    note.gettingStarted = null;
    note.sources.push({ id: 's5', type: 'readme', url: 'https://github.com/owner/name#readme' });
    const r = checkResearchNote(note, v);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain('sources: "s5" is never referenced');
    expect(r.warnings).toContain('sources: only README was used');
    expect(r.warnings.some((w) => w.startsWith('gettingStarted:'))).toBe(true);
  });

  it('rejects facts without sources on a not-studyable note', () => {
    const note = { ...fixture('not-studyable-note'), facts: [{ claim: 'x', sourceIds: ['s1'] }] } as ResearchNote;
    expect(checkResearchNote(note, v).errors.some((e) => e.includes('without sources'))).toBe(true);
  });

  it('rejects malformed source entries and ids', () => {
    const note = clone(fixture('valid-note'));
    note.sources![0] = { id: 'x1', type: 'readme', url: 'not-a-url' } as never;
    expect(checkResearchNote(note, v).ok).toBe(false);
    const wrongType = clone(fixture('valid-note'));
    wrongType.sources![0]!.type = 'tweet' as never;
    expect(checkResearchNote(wrongType, v).ok).toBe(false);
  });

  it('rejects a studyability that contradicts its category', () => {
    const note = clone(fixture('valid-note'));
    note.studyability.category = 'awesome-list';
    expect(checkResearchNote(note, v).ok).toBe(false);
  });
});

describe('collectSourceRefs', () => {
  it('collects every sourced section with its path', () => {
    const paths = collectSourceRefs(fixture('valid-note')).map((r) => r.path);
    expect(paths).toEqual([
      'architecture[0]', 'architecture[1]', 'keyFeatures[0]', 'keyFeatures[1]',
      'gettingStarted', 'recentReleases[0]', 'communitySignals[0]',
      'facts[0]', 'facts[1]', 'facts[2]', 'limitations[0]',
    ]);
  });

  it('returns nothing for a judgment-only note', () => {
    expect(collectSourceRefs(fixture('not-studyable-note'))).toEqual([]);
  });
});
