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
  data: { registry: string; studyQueue: string; snapshots: string };
  reports: { daily: string };
  studies: string;
  dist: { skills: string };
}

export function getProjectPaths(root: string = process.env.AGS_ROOT ?? DEFAULT_ROOT): ProjectPaths {
  const r = (...p: string[]) => resolve(root, ...p);
  return {
    root,
    config: { discovery: r('config/discovery.yml'), studyPolicy: r('config/study-policy.yml') },
    schemas: r('schemas'),
    skills: r('skills'),
    templates: r('templates'),
    data: {
      registry: r('data/registry.json'),
      studyQueue: r('data/study-queue.json'),
      snapshots: r('data/snapshots'),
    },
    reports: { daily: r('reports/daily') },
    studies: r('studies'),
    dist: { skills: r('dist/skills') },
  };
}
