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

/** 분석 완료된 표준 Repository 모델 */
export interface RepositoryInfo {
  repository: RepositoryId;
  url: string;
  description: string | null;
  stars: number;
  previousStars: number | null;
  delta24h: number | null;
  firstSeen: IsoDate;
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
  | 'skipped_pr_open';

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
  repositories: RepositoryInfo[];
  rankings: RankingResult;
  studyQueue: StudyQueue;
  dailyReport: DailyReport;
  studyDrafts: StudyDraft[];
}
