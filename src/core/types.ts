/**
 * Skill 간 공통 데이터 계약.
 * JSON Schema(schemas/*.schema.json)와 반드시 함께 갱신한다.
 */

/** "owner/name" 형식의 Repository 식별자 */
export type RepositoryId = string;

/** ISO 날짜 (YYYY-MM-DD) */
export type IsoDate = string;

/** ISO 8601 date-time */
export type IsoDateTime = string;

/** Discovery 단계에서 수집한 원시 관측값 (github-ai-discovery 출력) */
export interface RepositoryObservation {
  repository: RepositoryId;
  url: string;
  description: string | null;
  stars: number;
  topics?: string[];
  language?: string | null;
  pushedAt?: IsoDateTime | null;
}

/** Star 증감 비교 기준 Snapshot 정보 */
export interface Baseline {
  date: IsoDate;
  /** 오늘과 기준일 사이 일수. 1 이면 전날 */
  gapDays: number;
}

/** 분석 완료된 표준 Repository 모델 */
export interface RepositoryInfo {
  repository: RepositoryId;
  url: string;
  description: string | null;
  stars: number;
  /** 기준 Snapshot(baseline)의 stars. 기준에 없으면 null */
  previousStars: number | null;
  /** stars - previousStars. 기준일이 전날이 아니면 baseline.gapDays 기간의 증가량 */
  delta24h: number | null;
  firstSeen: IsoDate;
  /** Registry 에 처음 등록되는 Repository */
  isNew: boolean;
}

export interface RankingEntry extends RepositoryInfo {
  rank: number;
}

export interface RankingResult {
  totalStarsTop10: RankingEntry[];
  growth24hTop10: RankingEntry[];
  newlyDiscovered: RepositoryInfo[];
}

/** 날짜별 Star Snapshot (data/snapshots/YYYY-MM-DD.json) */
export interface SnapshotEntry {
  repository: RepositoryId;
  stars: number;
}

export interface Snapshot {
  version: 1;
  date: IsoDate;
  repositories: SnapshotEntry[];
}

export type StudyCandidateStatus =
  | 'selected'
  | 'queued'
  | 'skipped_study_exists'
  | 'skipped_pr_open'
  | 'skipped_not_studyable';

export interface StudyCandidate {
  repository: RepositoryId;
  priority: number;
  reasons: string[];
  status: StudyCandidateStatus;
}

export interface StudyQueue {
  version: 1;
  date: IsoDate;
  maxDailyDrafts: number;
  candidates: StudyCandidate[];
}

/** 기존 Study 상태 (registry 또는 GitHub 조회 결과를 adapter가 변환) */
export interface StudyState {
  studyExists: boolean;
  prOpen: boolean;
  /** github-researcher 가 Study 대상이 아니라고 판정한 저장소 */
  notStudyable?: boolean;
}

/** Study 적합성 분류 (github-researcher 가 판정) */
export const STUDYABLE_CATEGORIES = ['library', 'framework', 'tool', 'application', 'model', 'platform'] as const;
export const NOT_STUDYABLE_CATEGORIES = ['awesome-list', 'tutorial', 'course', 'interview-guide', 'documentation', 'other'] as const;
export type StudyabilityCategory =
  | (typeof STUDYABLE_CATEGORIES)[number]
  | (typeof NOT_STUDYABLE_CATEGORIES)[number];

export interface Studyability {
  studyable: boolean;
  category: StudyabilityCategory;
  /** 판정 근거 한 문장 */
  reason: string;
  checkedAt: IsoDate;
}

export interface StudyabilityUpdate {
  repository: RepositoryId;
  studyability: Studyability;
}

/** 최근 기간 동안 TOP10 등장 횟수 */
export interface RankingHistory {
  top10Days: number;
}

export interface StudyDraft {
  repository: RepositoryId;
  branch: string;
  path: string;
  title: string;
  markdown: string;
  prBody: string;
}

export interface DailyReport {
  path: string;
  markdown: string;
}

/** Claude → GitHub Actions 로 전달되는 단일 결과물 */
export interface DailyBundle {
  version: 1;
  runId: string;
  date: IsoDate;
  generatedAt: IsoDateTime;
  baseline: Baseline | null;
  repositories: RepositoryInfo[];
  rankings: RankingResult;
  studyQueue: StudyQueue;
  dailyReport: DailyReport;
  studyDrafts: StudyDraft[];
  /** 이번 실행에서 판정한 Study 적합성 → GitHub Actions 가 Registry 에 반영 */
  studyabilityUpdates: StudyabilityUpdate[];
}
