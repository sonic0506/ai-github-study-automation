import type { GitHubRestClient } from './github-rest.js';

/**
 * Gist 경유 Handoff.
 * Cowork → (1) 비공개 Gist 에 DailyBundle 업로드 → (2) repository_dispatch 로 Gist 주소 전달
 * GitHub Actions → Gist 를 받아 처리 → 마지막에 Gist 삭제
 *
 * 필요한 토큰 권한: gist (classic) 또는 Gists: read & write, 그리고 대상 저장소 Contents: read & write
 */

export interface GistFile {
  filename: string;
  raw_url: string;
  size: number;
  truncated?: boolean;
  content?: string;
}

export interface Gist {
  id: string;
  html_url: string;
  files: Record<string, GistFile>;
}

export interface HandoffPayload {
  /** repository_dispatch 의 client_payload (최상위 속성 10개 이하로 유지) */
  gist_id: string;
  gist_raw_url: string;
  filename: string;
  date: string;
  run_id: string;
  checksum: string;
  bytes: number;
}

export interface HandoffResult {
  gist: Gist;
  payload: HandoffPayload;
  eventType: string;
}

export class GistHandoff {
  constructor(private readonly client: GitHubRestClient) {}

  async createBundleGist(filename: string, content: string, description: string): Promise<Gist> {
    const gist = await this.client.request<Gist>('/gists', {
      method: 'POST',
      body: { description, public: false, files: { [filename]: { content } } },
    });
    if (!gist?.id) throw new Error('Gist creation returned no id');
    return gist;
  }

  async getGist(id: string): Promise<Gist | null> {
    return this.client.request<Gist>(`/gists/${id}`, { nullOn: [404] });
  }

  async deleteGist(id: string): Promise<void> {
    await this.client.request<void>(`/gists/${id}`, { method: 'DELETE', nullOn: [404] });
  }

  /** repository_dispatch 발송. repository 는 "owner/name" */
  async dispatch(repository: string, eventType: string, payload: HandoffPayload): Promise<void> {
    const [owner, name, ...rest] = repository.split('/');
    if (!owner || !name || rest.length) throw new Error(`Invalid repository id: ${repository}`);
    if (Object.keys(payload).length > 10) throw new Error('client_payload must have at most 10 top-level properties');
    await this.client.request<void>(`/repos/${owner}/${name}/dispatches`, {
      method: 'POST',
      body: { event_type: eventType, client_payload: payload },
    });
  }
}

export interface HandoffInput {
  repository: string;
  eventType: string;
  date: string;
  runId: string;
  checksum: string;
  content: string;
  filename?: string;
}

/** Gist 업로드 → dispatch 를 한 번에 */
export async function handoffBundle(handoff: GistHandoff, input: HandoffInput): Promise<HandoffResult> {
  const filename = input.filename ?? `daily-bundle-${input.date}.json`;
  const gist = await handoff.createBundleGist(
    filename,
    input.content,
    `ai-github-study daily bundle ${input.date} (${input.runId})`,
  );
  const file = gist.files[filename];
  if (!file) throw new Error(`Gist ${gist.id} has no file named ${filename}`);

  const payload: HandoffPayload = {
    gist_id: gist.id,
    gist_raw_url: file.raw_url,
    filename,
    date: input.date,
    run_id: input.runId,
    checksum: input.checksum,
    bytes: Buffer.byteLength(input.content),
  };
  try {
    await handoff.dispatch(input.repository, input.eventType, payload);
  } catch (e) {
    // dispatch 가 실패하면 Gist 를 남기지 않는다
    await handoff.deleteGist(gist.id).catch(() => undefined);
    throw e;
  }
  return { gist, payload, eventType: input.eventType };
}
