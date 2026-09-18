/**
 * 아주 작은 Markdown 템플릿 렌더러 (mustache 부분 집합).
 * 리포트의 표·숫자는 코드가 채우고, 레이아웃은 templates/*.md 에서 수정할 수 있게 한다.
 *
 * 지원 문법
 *   {{key}}        값 치환 (없으면 빈 문자열, HTML 이스케이프 없음 — Markdown 용)
 *   {{key.sub}}    중첩 값
 *   {{.}}          배열 항목이 스칼라일 때 그 값
 *   {{#key}}…{{/key}}   배열이면 반복, 객체/true 면 1회, 빈 배열/false/null 이면 생략
 *   {{^key}}…{{/key}}   비어 있을 때만 출력
 *   {{! 주석 }}    출력되지 않음
 *
 * 블록 태그가 한 줄을 독차지하면 그 줄(및 줄바꿈)은 출력에서 제거한다.
 */

export type TemplateValue = unknown;
export type TemplateData = Record<string, TemplateValue>;

const TAG = /\{\{([#^/!]?)\s*([^}]*?)\s*\}\}/g;

interface Section {
  type: 'text' | 'var' | 'section' | 'inverted';
  value: string;
  children?: Section[];
}

export function renderTemplate(template: string, data: TemplateData): string {
  const nodes = parse(stripStandaloneLines(template));
  return renderNodes(nodes, [data]);
}

/** 블록/주석 태그만 있는 줄은 줄 자체를 없앤다 */
function stripStandaloneLines(template: string): string {
  return template.replace(/^[ \t]*(\{\{[#^/!][^}]*\}\})[ \t]*\r?\n?/gm, '$1');
}

function parse(template: string): Section[] {
  const root: Section[] = [];
  const stack: Section[][] = [root];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG.lastIndex = 0;

  const push = (node: Section) => stack[stack.length - 1]!.push(node);
  const text = (s: string) => {
    if (s) push({ type: 'text', value: s });
  };

  while ((match = TAG.exec(template)) !== null) {
    text(template.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
    const [, sigil, name] = match as unknown as [string, string, string];
    if (sigil === '!') continue;
    if (sigil === '#' || sigil === '^') {
      const node: Section = { type: sigil === '#' ? 'section' : 'inverted', value: name, children: [] };
      push(node);
      stack.push(node.children!);
    } else if (sigil === '/') {
      if (stack.length === 1) throw new Error(`Unexpected closing tag: {{/${name}}}`);
      stack.pop();
    } else {
      push({ type: 'var', value: name });
    }
  }
  text(template.slice(lastIndex));
  if (stack.length !== 1) throw new Error('Unclosed template section');
  return root;
}

function renderNodes(nodes: Section[], scopes: TemplateValue[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.value;
      continue;
    }
    const value = lookup(node.value, scopes);
    if (node.type === 'var') {
      out += value === null || value === undefined ? '' : String(value);
    } else if (node.type === 'section') {
      if (Array.isArray(value)) for (const item of value) out += renderNodes(node.children!, [item, ...scopes]);
      else if (isTruthy(value)) out += renderNodes(node.children!, [value, ...scopes]);
    } else if (!isTruthy(value)) {
      out += renderNodes(node.children!, scopes);
    }
  }
  return out;
}

const isTruthy = (v: TemplateValue): boolean => (Array.isArray(v) ? v.length > 0 : Boolean(v));

function lookup(path: string, scopes: TemplateValue[]): TemplateValue {
  if (path === '.') return scopes[0];
  const [head, ...rest] = path.split('.');
  for (const scope of scopes) {
    if (scope && typeof scope === 'object' && head! in (scope as Record<string, unknown>)) {
      let value: TemplateValue = (scope as Record<string, unknown>)[head!];
      for (const key of rest) {
        if (value === null || typeof value !== 'object') return undefined;
        value = (value as Record<string, unknown>)[key];
      }
      return value;
    }
  }
  return undefined;
}
