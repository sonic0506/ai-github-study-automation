import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 프로젝트 경로를 한 곳에서 관리한다.
 * - 루트는 AGS_ROOT 환경변수 또는 인자로 덮어쓸 수 있다.
 * - Skill 런타임 코드는 이 모듈을 사용하지 않는다 (로컬 FS 비의존).
 */
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface ProjectPaths {
  root: string;
  config: { discovery: string; studyPolicy: string };
  schemas: string;
  skills: string;
  templates: string;
  data: { dir: string; registry: string; studyQueue: string; snapshots: string };
  output: string;
  reports: { daily: string };
  studies: string;
  dist: { skills: string };
}

/**
 * @param root    프로젝트 루트 (기본: AGS_ROOT 또는 이 파일 기준)
 * @param dataDir Snapshot/Registry 위치 (기본: AGS_DATA_DIR 또는 data). 로컬 실험은 output/local-data 권장
 */
export function getProjectPaths(
  root: string = process.env.AGS_ROOT || DEFAULT_ROOT,
  dataDir: string = process.env.AGS_DATA_DIR || 'data',
): ProjectPaths {
  const r = (...p: string[]) => resolve(root, ...p);
  const d = (...p: string[]) => resolve(root, dataDir, ...p);
  return {
    root,
    config: { discovery: r('config/discovery.yml'), studyPolicy: r('config/study-policy.yml') },
    schemas: r('schemas'),
    skills: r('skills'),
    templates: r('templates'),
    data: {
      dir: d(),
      registry: d('registry.json'),
      studyQueue: d('study-queue.json'),
      snapshots: d('snapshots'),
    },
    output: r('output'),
    reports: { daily: r('reports/daily') },
    studies: r('studies'),
    dist: { skills: r('dist/skills') },
  };
}
