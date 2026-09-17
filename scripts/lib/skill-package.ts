import { build } from 'esbuild';
import { zipSync, type Zippable } from 'fflate';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Skill 패키징 공통 로직 (test:skills / build:skills 공용).
 *
 * staging 결과 = Claude 에 업로드되는 Skill 폴더 그대로:
 *   {name}/SKILL.md
 *   {name}/resources/**   (skill 원본 + skill.json.bundle 로 복사된 config/schema/template)
 *   {name}/scripts/*.mjs  (esbuild 로 번들된 단일 실행 파일, node 내장 모듈 외 의존성 없음)
 * 제외: tests/, skill.json, *.ts
 */

export const SkillMetaSchema = z.object({
  kind: z.enum(['deterministic', 'generative']),
  entries: z.array(z.object({ source: z.string(), output: z.string().regex(/\.mjs$/) })).default([]),
  bundle: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  cliTests: z
    .array(
      z.object({
        entry: z.string(),
        input: z.string(),
        expected: z.string().optional(),
        schema: z.string().optional(),
        schemas: z.record(z.string()).optional(),
      }),
    )
    .default([]),
  fixtureSchemas: z.array(z.object({ file: z.string(), schema: z.string() })).default([]),
});
export type SkillMeta = z.infer<typeof SkillMetaSchema>;

export interface SkillSource {
  name: string;
  dir: string;
  meta: SkillMeta;
}

export interface Frontmatter {
  name: string;
  description: string;
}

const EXCLUDED_DIRS = new Set(['tests', 'node_modules']);
const EXCLUDED_FILES = new Set(['skill.json', '.DS_Store', '.gitkeep']);
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FIXED_MTIME = new Date('2026-01-01T00:00:00Z'); // 재현 가능한 ZIP

export async function listSkills(skillsDir: string, only?: string[]): Promise<SkillSource[]> {
  const names = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => !only?.length || only.includes(n))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const dir = join(skillsDir, name);
      const metaPath = join(dir, 'skill.json');
      const raw = (await exists(metaPath)) ? JSON.parse(await readFile(metaPath, 'utf8')) : { kind: 'generative' };
      return { name, dir, meta: SkillMetaSchema.parse(raw) };
    }),
  );
}

export function parseFrontmatter(markdown: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  if (!m) throw new Error('SKILL.md must start with YAML frontmatter (---)');
  const fm = parseYaml(m[1]!) as Partial<Frontmatter> | null;
  return { name: String(fm?.name ?? ''), description: String(fm?.description ?? '') };
}

/** Skill 한 개를 staging 디렉터리에 조립한다. 반환값: staging 경로 */
export async function stageSkill(skill: SkillSource, projectRoot: string, stagingRoot: string): Promise<string> {
  const out = join(stagingRoot, skill.name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  await copyFiltered(skill.dir, out);

  for (const b of skill.meta.bundle) {
    const dest = join(out, b.to);
    await mkdir(dirname(dest), { recursive: true });
    await cp(join(projectRoot, b.from), dest);
  }

  for (const e of skill.meta.entries) {
    await build({
      entryPoints: [join(skill.dir, e.source)],
      outfile: join(out, e.output),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      legalComments: 'none',
      logLevel: 'silent',
      // CJS 의존성(yaml 등)이 node 내장 모듈을 require 할 수 있도록 ESM 번들에 require 를 주입
      banner: {
        js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
      },
    });
  }
  return out;
}

async function copyFiltered(src: string, dest: string): Promise<void> {
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await mkdir(to, { recursive: true });
      await copyFiltered(from, to);
    } else if (!EXCLUDED_FILES.has(entry.name) && !entry.name.endsWith('.ts')) {
      await cp(from, to);
    }
  }
  // 빈 디렉터리 정리 (예: .ts 만 있던 scripts/)
  if ((await readdir(dest)).length === 0) await rm(dest, { recursive: true });
}

/** staging 결과 검증. 오류 메시지 목록을 반환 (빈 배열 = 통과) */
export async function validateStaged(skill: SkillSource, stagedDir: string): Promise<string[]> {
  const errors: string[] = [];
  const skillMdPath = join(stagedDir, 'SKILL.md');
  if (!(await exists(skillMdPath))) return ['SKILL.md is missing'];

  const md = await readFile(skillMdPath, 'utf8');
  try {
    const fm = parseFrontmatter(md);
    if (fm.name !== skill.name) errors.push(`frontmatter name "${fm.name}" must equal directory "${skill.name}"`);
    if (!SKILL_NAME_RE.test(fm.name) || fm.name.length > 64) errors.push(`invalid skill name "${fm.name}"`);
    if (!fm.description.trim()) errors.push('frontmatter description is empty');
    if (fm.description.length > 1024) errors.push(`description too long (${fm.description.length} > 1024)`);
    if (/[<>]/.test(fm.description)) errors.push('description must not contain angle brackets');
  } catch (e) {
    errors.push((e as Error).message);
  }

  // SKILL.md 가 참조하는 번들 내부 파일이 실제로 존재하는지
  for (const ref of new Set(md.match(/\b(?:resources|scripts)\/[\w.\-/]+[\w]/g) ?? [])) {
    if (!(await exists(join(stagedDir, ref)))) errors.push(`SKILL.md references missing file: ${ref}`);
  }

  const files = await walk(stagedDir);
  const tsFiles = files.filter((f) => f.endsWith('.ts'));
  if (tsFiles.length) errors.push(`TypeScript sources must not be packaged: ${tsFiles.join(', ')}`);
  if (files.some((f) => f.startsWith('tests/'))) errors.push('tests/ must not be packaged');
  for (const e of skill.meta.entries) {
    if (!files.includes(e.output)) errors.push(`bundled entry missing: ${e.output}`);
  }
  if (skill.meta.kind === 'deterministic' && skill.meta.entries.length === 0) {
    errors.push('deterministic skill must declare at least one script entry');
  }
  return errors;
}

/** staging 디렉터리를 `{name}/...` 구조의 ZIP 으로 만든다 (파일 순서/시간 고정) */
export async function zipStaged(stagedDir: string, name: string, zipPath: string): Promise<number> {
  const tree: Zippable = {};
  for (const rel of (await walk(stagedDir)).sort()) {
    const data = new Uint8Array(await readFile(join(stagedDir, rel)));
    tree[`${name}/${rel}`] = [data, { mtime: FIXED_MTIME, level: 9 }];
  }
  const zipped = zipSync(tree);
  await mkdir(dirname(zipPath), { recursive: true });
  await writeFile(zipPath, zipped);
  return zipped.byteLength;
}

export async function walk(root: string, dir = root): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(root, full)));
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

export async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

export function parseOnlyArg(argv: string[]): string[] {
  const i = argv.indexOf('--only');
  return i >= 0 && argv[i + 1] ? argv[i + 1]!.split(',') : [];
}
