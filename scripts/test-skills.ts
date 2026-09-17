/**
 * npm run test:skills [-- --only name1,name2]
 *
 * Skill 단위 패키지 테스트:
 *  1. staging (업로드될 형태로 조립) + 구조/frontmatter/참조 파일 검증
 *  2. deterministic: 번들된 .mjs CLI 를 fixture 로 실제 실행 → 기대값 비교 + JSON Schema 검증
 *  3. generative: rubric / fixture 존재 및 형식 검증, fixture JSON Schema 검증
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { getProjectPaths } from '../src/core/paths.js';
import { loadValidator, type SchemaValidator } from '../src/core/schema.js';
import {
  exists,
  listSkills,
  parseOnlyArg,
  stageSkill,
  validateStaged,
  type SkillSource,
} from './lib/skill-package.js';

const run = promisify(execFile);
const paths = getProjectPaths();

interface Result {
  skill: string;
  kind: string;
  checks: number;
  errors: string[];
}

async function readJson(p: string): Promise<unknown> {
  return JSON.parse(await readFile(p, 'utf8'));
}

function getPointer(data: unknown, pointer: string): unknown {
  return pointer
    .split('/')
    .slice(1)
    .reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], data);
}

async function checkGenerative(skill: SkillSource, validator: SchemaValidator, r: Result): Promise<void> {
  const rubricPath = join(skill.dir, 'tests', 'rubric.md');
  if (!(await exists(rubricPath))) {
    r.errors.push('tests/rubric.md is missing');
  } else {
    const rubric = await readFile(rubricPath, 'utf8');
    const items = rubric.match(/^- \[ \] /gm)?.length ?? 0;
    const required = rubric.match(/^- \[ \] ★/gm)?.length ?? 0;
    r.checks++;
    if (items < 3) r.errors.push(`rubric needs >= 3 criteria (found ${items})`);
    if (required < 1) r.errors.push('rubric needs >= 1 required (★) criterion');
  }
  const fixturesDir = join(skill.dir, 'tests', 'fixtures');
  r.checks++;
  if (!(await exists(fixturesDir)) || (await readdir(fixturesDir)).length === 0) {
    r.errors.push('tests/fixtures must contain at least one fixture');
  } else {
    for (const f of (await readdir(fixturesDir)).filter((x) => x.endsWith('.json'))) {
      r.checks++;
      await readJson(join(fixturesDir, f)).catch((e: Error) => r.errors.push(`fixture ${f} is not valid JSON: ${e.message}`));
    }
  }
  for (const fs of skill.meta.fixtureSchemas) {
    r.checks++;
    const res = validator.validate(fs.schema, await readJson(join(skill.dir, fs.file)));
    if (!res.valid) r.errors.push(`${fs.file} ✗ ${fs.schema}: ${res.errors.join('; ')}`);
  }
}

async function checkCli(skill: SkillSource, staged: string, validator: SchemaValidator, r: Result): Promise<void> {
  if (skill.meta.kind === 'deterministic' && skill.meta.cliTests.length === 0) {
    r.errors.push('deterministic skill must declare cliTests');
  }
  if (skill.meta.kind === 'deterministic') {
    const unitTests = (await readdir(join(skill.dir, 'tests'))).filter((f) => f.endsWith('.test.ts'));
    r.checks++;
    if (unitTests.length === 0) r.errors.push('deterministic skill must have tests/*.test.ts unit tests');
  }

  for (const t of skill.meta.cliTests) {
    const label = `${t.entry} < ${t.input}`;
    let output: unknown;
    try {
      // 번들된 스크립트를 staging(=업로드 형태)에서 실행 → 로컬 프로젝트 파일 비의존 확인
      const { stdout } = await run(process.execPath, [join(staged, t.entry), join(skill.dir, t.input)], {
        cwd: staged,
        env: { PATH: process.env.PATH ?? '' },
      });
      output = JSON.parse(stdout);
      r.checks++;
    } catch (e) {
      r.errors.push(`${label}: execution failed — ${(e as Error).message}`);
      continue;
    }
    if (t.expected) {
      r.checks++;
      if (!isDeepStrictEqual(output, await readJson(join(skill.dir, t.expected)))) {
        r.errors.push(`${label}: output differs from ${t.expected}`);
      }
    }
    const targets: [string, string][] = [
      ...(t.schema ? ([['', t.schema]] as [string, string][]) : []),
      ...Object.entries(t.schemas ?? {}),
    ];
    for (const [pointer, schema] of targets) {
      r.checks++;
      const res = validator.validate(schema, pointer ? getPointer(output, pointer) : output);
      if (!res.valid) r.errors.push(`${label}${pointer} ✗ ${schema}: ${res.errors.join('; ')}`);
    }
  }
}

async function main(): Promise<void> {
  const only = parseOnlyArg(process.argv);
  const skills = await listSkills(paths.skills, only);
  const validator = await loadValidator(paths.schemas);
  const stagingRoot = await mkdtemp(join(tmpdir(), 'skills-test-'));
  const results: Result[] = [];

  try {
    for (const skill of skills) {
      const r: Result = { skill: skill.name, kind: skill.meta.kind, checks: 0, errors: [] };
      results.push(r);
      try {
        const staged = await stageSkill(skill, paths.root, stagingRoot);
        const structural = await validateStaged(skill, staged);
        r.checks++;
        r.errors.push(...structural);
        await checkCli(skill, staged, validator, r);
        if (skill.meta.kind === 'generative') await checkGenerative(skill, validator, r);
      } catch (e) {
        r.errors.push(`unexpected error: ${(e as Error).stack ?? e}`);
      }
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  console.log('\nSkill package tests\n');
  for (const r of results) {
    const mark = r.errors.length ? '✗' : '✓';
    console.log(`${mark} ${r.skill.padEnd(26)} ${r.kind.padEnd(14)} ${r.checks} checks`);
    for (const e of r.errors) console.log(`    - ${e}`);
  }
  const failed = results.filter((r) => r.errors.length);
  console.log(`\n${results.length - failed.length}/${results.length} skills passed`);
  if (results.length === 0) {
    console.error('No skills found');
    process.exit(1);
  }
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
