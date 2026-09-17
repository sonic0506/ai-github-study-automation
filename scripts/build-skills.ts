/**
 * npm run build:skills [-- --only name1,name2]
 *
 * skills/* 를 Claude Custom Skill 업로드용 ZIP 으로 만든다.
 *   dist/skills/{name}.zip  →  {name}/SKILL.md, resources/, scripts/*.mjs
 */
import { mkdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { getProjectPaths } from '../src/core/paths.js';
import { listSkills, parseOnlyArg, stageSkill, validateStaged, walk, zipStaged } from './lib/skill-package.js';

const paths = getProjectPaths();

async function main(): Promise<void> {
  const only = parseOnlyArg(process.argv);
  const outDir = paths.dist.skills;
  const stagingRoot = join(outDir, '.staging');
  if (!only.length) await rm(outDir, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });

  const skills = await listSkills(paths.skills, only);
  if (skills.length === 0) throw new Error(`No skills found${only.length ? ` for --only ${only.join(',')}` : ''}`);

  const failures: string[] = [];
  console.log('\nBuilding skills\n');
  try {
    for (const skill of skills) {
      const staged = await stageSkill(skill, paths.root, stagingRoot);
      const errors = await validateStaged(skill, staged);
      if (errors.length) {
        failures.push(skill.name);
        console.log(`✗ ${skill.name}\n${errors.map((e) => `    - ${e}`).join('\n')}`);
        continue;
      }
      const zipPath = join(outDir, `${skill.name}.zip`);
      const bytes = await zipStaged(staged, skill.name, zipPath);
      const files = await walk(staged);
      console.log(`✓ ${relative(paths.root, zipPath).padEnd(44)} ${(bytes / 1024).toFixed(1).padStart(7)} KB  (${files.length} files)`);
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\nBuild failed for: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n${skills.length} skill ZIP(s) written to ${relative(paths.root, outDir)}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
