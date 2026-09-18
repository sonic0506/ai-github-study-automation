import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/core/template.js';

describe('renderTemplate', () => {
  it('substitutes values and nested paths', () => {
    expect(renderTemplate('# {{title}} ({{meta.date}})', { title: 'Daily', meta: { date: '2026-09-18' } })).toBe(
      '# Daily (2026-09-18)',
    );
  });

  it('renders missing values as empty strings', () => {
    expect(renderTemplate('[{{nope}}][{{a.b.c}}]', { a: {} })).toBe('[][]');
    expect(renderTemplate('{{zero}}/{{empty}}', { zero: 0, empty: '' })).toBe('0/');
  });

  it('repeats array sections and drops the tag lines', () => {
    const t = '표\n{{#rows}}\n| {{rank}} | {{name}} |\n{{/rows}}\n끝\n';
    expect(renderTemplate(t, { rows: [{ rank: 1, name: 'a' }, { rank: 2, name: 'b' }] })).toBe(
      '표\n| 1 | a |\n| 2 | b |\n끝\n',
    );
  });

  it('renders scalar array items with {{.}} and looks up outer scopes', () => {
    expect(renderTemplate('{{#tags}}#{{.}}({{date}}) {{/tags}}', { tags: ['ai', 'rag'], date: 'd' })).toBe(
      '#ai(d) #rag(d) ',
    );
  });

  it('skips empty sections and renders inverted ones instead', () => {
    const t = '{{#items}}- {{.}}\n{{/items}}{{^items}}(없음)\n{{/items}}';
    expect(renderTemplate(t, { items: [] })).toBe('(없음)\n');
    expect(renderTemplate(t, { items: ['x'] })).toBe('- x\n');
    expect(renderTemplate('{{^missing}}fallback{{/missing}}', {})).toBe('fallback');
  });

  it('renders an object section once and a false section not at all', () => {
    expect(renderTemplate('{{#baseline}}기준 {{date}}{{/baseline}}', { baseline: { date: '2026-09-17' } })).toBe('기준 2026-09-17');
    expect(renderTemplate('{{#baseline}}기준{{/baseline}}', { baseline: null })).toBe('');
    expect(renderTemplate('{{#flag}}on{{/flag}}', { flag: true })).toBe('on');
  });

  it('ignores comments and rejects malformed templates', () => {
    expect(renderTemplate('a{{! 주석 }}b', {})).toBe('ab');
    expect(() => renderTemplate('{{#a}}x', { a: [1] })).toThrow(/Unclosed/);
    expect(() => renderTemplate('x{{/a}}', {})).toThrow(/Unexpected closing/);
  });

  it('keeps markdown characters as-is (no escaping)', () => {
    expect(renderTemplate('{{v}}', { v: '**bold** <b> & |' })).toBe('**bold** <b> & |');
  });
});
