import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { readRegistry, writeJson, writeSnapshot } from './local-store.js';
import { applyStudyabilityUpdates, updateRegistry } from './registry.js';
import type { DailyBundle, Snapshot, StudyDraft } from './types.js';

/**
 * DailyBundle 을 저장소 파일로 반영한다 (GitHub Actions 에서 실행).
 * - data/snapshots/{date}.json : repositories 의 stars 로 구성
 * - data/registry.json         : firstSeen/lastSeen 갱신 + studyability 판정 반영
 * - data/study-queue.json      : 그날 Study Queue
 * - reports/daily/{date}.md    : Daily Report
 * Study 초안은 branch 별로 따로 쓰므로 writeStudyDraft 를 사용한다.
 */

export interface ApplyPaths {
  root: string;
  dataDir: string;
}

export interface ApplyResult {
  written: string[];
  registrySize: number;
  studyabilityUpdates: number;
}

export function snapshotFromBundle(bundle: DailyBundle): Snapshot {
  return {
    version: 1,
    date: bundle.date,
    repositories: [...bundle.repositories]
      .sort((a, b) => a.repository.toLowerCase().localeCompare(b.repository.toLowerCase()))
      .map((r) => ({ repository: r.repository, stars: r.stars })),
  };
}

/** Repository 루트를 벗어나는 경로를 막는다 */
export function resolveInside(root: string, relativePath: string): string {
  const full = resolve(root, relativePath);
  const rel = relative(root, full);
  if (rel.startsWith('..') || resolve(root, rel) !== full) {
    throw new Error(`Path escapes the repository root: ${relativePath}`);
  }
  return full;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content.endsWith('\n') ? content : `${content}\n`);
}

export async function applyBundle(bundle: DailyBundle, paths: ApplyPaths): Promise<ApplyResult> {
  const dataDir = resolveInside(paths.root, paths.dataDir);
  const written: string[] = [];
  const track = (p: string) => written.push(relative(paths.root, p));

  const snapshotPath = await writeSnapshot(join(dataDir, 'snapshots'), snapshotFromBundle(bundle));
  track(snapshotPath);

  const registryPath = join(dataDir, 'registry.json');
  const now = bundle.generatedAt;
  let registry = updateRegistry(await readRegistry(registryPath), bundle.date, bundle.repositories, now);
  if (bundle.studyabilityUpdates.length) {
    registry = applyStudyabilityUpdates(registry, bundle.studyabilityUpdates, now);
  }
  await writeJson(registryPath, registry);
  track(registryPath);

  const queuePath = join(dataDir, 'study-queue.json');
  await writeJson(queuePath, bundle.studyQueue);
  track(queuePath);

  const reportPath = resolveInside(paths.root, bundle.dailyReport.path);
  await writeText(reportPath, bundle.dailyReport.markdown);
  track(reportPath);

  return {
    written,
    registrySize: Object.keys(registry.repositories).length,
    studyabilityUpdates: bundle.studyabilityUpdates.length,
  };
}

/** Study 초안 하나를 파일로 쓴다 (branch 를 만든 뒤 호출) */
export async function writeStudyDraft(draft: StudyDraft, root: string): Promise<string> {
  const path = resolveInside(root, draft.path);
  await writeText(path, draft.markdown);
  return relative(root, path);
}
