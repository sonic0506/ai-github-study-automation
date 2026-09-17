import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { emptyRegistry, type Registry } from './registry.js';
import type { IsoDate, Snapshot } from './types.js';

/**
 * 로컬 파일 기반 저장소 (로컬 실행 / GitHub Actions 용).
 * Skill 런타임 코드는 이 모듈을 사용하지 않는다.
 */

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function readRegistry(path: string): Promise<Registry> {
  return (await readJsonIfExists<Registry>(path)) ?? emptyRegistry();
}

export async function listSnapshotDates(dir: string): Promise<IsoDate[]> {
  try {
    return (await readdir(dir))
      .map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

export async function readSnapshot(dir: string, date: IsoDate): Promise<Snapshot | null> {
  return readJsonIfExists<Snapshot>(join(dir, `${date}.json`));
}

export async function writeSnapshot(dir: string, snapshot: Snapshot): Promise<string> {
  const path = join(dir, `${snapshot.date}.json`);
  await writeJson(path, snapshot);
  return path;
}
