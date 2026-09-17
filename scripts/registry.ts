/**
 * 로컬 Registry(AGS_DATA_DIR/registry.json) 관리
 *
 *   npm run registry -- list [--not-studyable]
 *   npm run registry -- mark <owner/name> --category <category> --reason "<근거>"
 *   npm run registry -- unmark <owner/name>
 *
 * category
 *   Study 대상     : library, framework, tool, application, model, platform
 *   Study 대상 아님 : awesome-list, tutorial, course, interview-guide, documentation, other
 */
import { relative } from 'node:path';
import { loadEnv, todayIn } from '../src/core/env.js';
import { readRegistry, writeJson } from '../src/core/local-store.js';
import { getProjectPaths } from '../src/core/paths.js';
import { applyStudyability } from '../src/core/registry.js';
import { STUDYABLE_CATEGORIES, type StudyabilityCategory } from '../src/core/types.js';

const env = loadEnv();
const paths = getProjectPaths();
const [command, repository] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const registry = await readRegistry(paths.data.registry);
  const save = async (next: typeof registry) => {
    await writeJson(paths.data.registry, next);
    console.log(`저장: ${relative(paths.root, paths.data.registry)}`);
  };

  switch (command) {
    case 'list': {
      const onlyNot = process.argv.includes('--not-studyable');
      const rows = Object.entries(registry.repositories).filter(([, e]) => !onlyNot || e.studyability?.studyable === false);
      console.log(`Registry (${relative(paths.root, paths.data.registry)}) — ${rows.length}개`);
      for (const [id, e] of rows) {
        const s = e.studyability;
        console.log(`${id.padEnd(45)} ${e.firstSeen} ~ ${e.lastSeen}  ${s ? `${s.studyable ? '✓' : '✗'} ${s.category} — ${s.reason}` : ''}`);
      }
      return;
    }
    case 'mark': {
      const category = flag('--category') as StudyabilityCategory | undefined;
      const reason = flag('--reason');
      if (!repository || !category || !reason) throw new Error('usage: mark <owner/name> --category <category> --reason "<근거>"');
      const studyable = (STUDYABLE_CATEGORIES as readonly string[]).includes(category);
      await save(
        applyStudyability(
          registry,
          [{ repository, studyability: { studyable, category, reason, checkedAt: todayIn(env.AGS_TIMEZONE) } }],
          new Date().toISOString(),
        ),
      );
      console.log(`${repository}: ${studyable ? 'Study 대상' : 'Study 대상 아님'} (${category})`);
      return;
    }
    case 'unmark': {
      if (!repository) throw new Error('usage: unmark <owner/name>');
      await save(applyStudyability(registry, [{ repository, studyability: null }], new Date().toISOString()));
      console.log(`${repository}: 판정 삭제 (다시 판정 대상)`);
      return;
    }
    default:
      console.log('usage: npm run registry -- list [--not-studyable] | mark <repo> --category <c> --reason "<r>" | unmark <repo>');
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
