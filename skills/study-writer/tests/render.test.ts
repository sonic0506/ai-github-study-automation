import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ResearchNote } from '../../../src/core/types.js';
import { footnoteRefs, numberSections, renderStudyDraft, type StudyRenderInput } from '../scripts/render.js';

const root = new URL('../../../', import.meta.url);
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, root)), 'utf8');
const templates = { study: read('templates/study.md'), pr: read('templates/study-pr.md') };
const fixture = JSON.parse(read('skills/study-writer/tests/fixtures/input.json')) as Omit<StudyRenderInput, 'templates'>;

const input = (over: Partial<StudyRenderInput> = {}): StudyRenderInput => ({
  ...structuredClone(fixture),
  templates,
  ...over,
});

const withNote = (mutate: (n: ResearchNote) => void): StudyRenderInput => {
  const base = input();
  mutate(base.note);
  return base;
};

describe('renderStudyDraft', () => {
  it('builds branch, path and title from the lowercase slug', () => {
    const draft = renderStudyDraft(
      input({ repository: { ...fixture.repository, repository: 'Browser-Use/Browser-Use' }, note: { ...fixture.note, repository: 'Browser-Use/Browser-Use' } }),
    );
    expect(draft).toMatchObject({
      repository: 'Browser-Use/Browser-Use',
      branch: 'study/browser-use__browser-use',
      path: 'studies/browser-use__browser-use.md',
      title: '[Study] Browser-Use/Browser-Use',
    });
  });

  it('writes frontmatter and keeps the note sentences unchanged', () => {
    const md = renderStudyDraft(input()).markdown;
    expect(md.startsWith('---\nrepository: browser-use/browser-use\n')).toBe(true);
    expect(md).toContain('status: draft');
    expect(md).toContain('stars: 114,886');
    expect(md).toContain(fixture.note.summary!);
    expect(md).toContain(fixture.note.problem!);
    expect(md).toContain('- MIT 라이선스로 배포된다[^s1]');
  });

  it('adds footnote references and a source list', () => {
    const md = renderStudyDraft(input()).markdown;
    expect(md).toContain('- Agent : 작업 지시와 LLM 을 받아 브라우저 조작 단계를 수행함[^s1]');
    expect(md).toContain('[^s1]: [browser-use README](https://github.com/browser-use/browser-use#readme)');
    expect(md).toContain('- [Releases](https://github.com/browser-use/browser-use/releases) (release)');
  });

  it('renders the install block with the language of the example', () => {
    const md = renderStudyDraft(input()).markdown;
    expect(md).toContain('```bash\nuv add browser-use\n```');
    expect(md).toContain('```python\nimport asyncio');
  });

  it('numbers only the sections that exist', () => {
    const md = renderStudyDraft(input()).markdown;
    const headings = md.match(/^## .+$/gm)!;
    expect(headings).toEqual([
      '## 01. 어떤 문제를 푸는가',
      '## 02. 핵심 구조',
      '## 03. 주요 기능',
      '## 04. 시작하기',
      '## 05. 커뮤니티에서 반복되는 주제',
      '## 06. 한계와 주의점',
      '## 07. 더 알아볼 것',
      '## 참고 자료',
    ]);
  });

  it('drops empty sections entirely', () => {
    const md = renderStudyDraft(
      withNote((n) => {
        n.architecture = [];
        n.communitySignals = [];
        n.limitations = [];
        n.openQuestions = [];
        n.gettingStarted = null;
      }),
    ).markdown;
    expect(md.match(/^## .+$/gm)).toEqual(['## 01. 어떤 문제를 푸는가', '## 02. 주요 기능', '## 참고 자료']);
    expect(md).not.toContain('시작하기');
  });

  it('renders releases with highlights when present', () => {
    const md = renderStudyDraft(
      withNote((n) => {
        n.recentReleases = [
          { version: 'v0.13.3', date: '2026-09-10', highlights: ['CLI 3.0 공개', 'skill 설치 지원'], sourceIds: ['s2'] },
        ];
      }),
    ).markdown;
    expect(md).toContain('## 05. 최근 변화');
    expect(md).toContain('- v0.13.3 (2026-09-10)[^s2]');
    expect(md).toContain('    - CLI 3.0 공개');
  });

  it('lists only referenced sources as footnotes', () => {
    const md = renderStudyDraft(
      withNote((n) => {
        n.sources!.push({ id: 's9', type: 'blog', url: 'https://example.com/post', title: '미참조 글' });
      }),
    ).markdown;
    expect(md).toContain('- [미참조 글](https://example.com/post) (blog)');
    expect(md).not.toContain('[^s9]:');
  });

  it('builds the PR body from the candidate and the note', () => {
    const pr = renderStudyDraft(input()).prBody;
    expect(pr).toContain('## Study Draft: browser-use/browser-use');
    expect(pr).toContain('- Stars: 114,886 (24h +320)');
    expect(pr).toContain('- 선정 점수: 52.41');
    expect(pr).toContain('- 분류: library');
    expect(pr).toContain('- growth_24h: +320 stars');
    expect(pr).toContain('- 출처 2건: readme, release');
    expect(pr).toContain('- 사실 5건');
    expect(pr).toContain('확인하지 못한 내용:');
    expect(pr).toContain('- [ ] 머지 후 frontmatter의 `status`를 `published`로 변경');
  });

  it('omits the delta label for a new repository', () => {
    const pr = renderStudyDraft(input({ repository: { ...fixture.repository, delta24h: null } })).prBody;
    expect(pr).toContain('- Stars: 114,886\n');
    expect(pr).not.toContain('(24h'); // growth_24h 는 선정 사유에 남는다
  });

  it('rejects mismatched, not-studyable or incomplete notes', () => {
    expect(() => renderStudyDraft(input({ repository: { ...fixture.repository, repository: 'other/repo' } }))).toThrow(/must match/);
    expect(() =>
      renderStudyDraft(withNote((n) => {
        n.studyability = { studyable: false, category: 'awesome-list', reason: '목록', checkedAt: '2026-09-18' };
      })),
    ).toThrow(/not studyable/);
    expect(() => renderStudyDraft(withNote((n) => { n.facts = []; }))).toThrow(/missing summary, problem or facts/);
  });

  it('ends files with exactly one newline and no triple blank lines', () => {
    const { markdown, prBody } = renderStudyDraft(input());
    for (const text of [markdown, prBody]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toMatch(/\n{3}/);
    }
  });

  it('is deterministic', () => {
    expect(renderStudyDraft(input())).toEqual(renderStudyDraft(input()));
  });
});

describe('helpers', () => {
  it('formats footnote references', () => {
    expect(footnoteRefs(['s1', 's2'])).toBe('[^s1][^s2]');
    expect(footnoteRefs(undefined)).toBe('');
  });

  it('numbers present sections in order', () => {
    expect(numberSections({ a: true, b: false, c: true })).toEqual({ a: '01', c: '02' });
  });
});
