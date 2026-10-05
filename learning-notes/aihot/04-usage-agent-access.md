# AIHOT 활용 예시 ② 읽는 쪽: RSS·API·MCP로 가져다 쓰기

> 이미 떠 있는 AIHOT 사이트의 결과를 RSS, 공개 API(`/api/v1`), 증분 동기화, MCP로 가져다 쓰는 방법을 "읽는 쪽(Client)" 관점에서 다룹니다.

AIHOT은 브라우저에 넣는 클라이언트 라이브러리가 아닙니다. 대신 완성된 사이트가 여러 개의 "출구"를 내보내고, 그 출구를 읽는 쪽이 클라이언트가 됩니다. 사람은 웹과 RSS로, 프로그램은 API로, 에이전트는 MCP로 같은 데이터를 읽습니다.

## 활용할 수 있는 기능

| 출구 | 주소 | 쓰임 |
|---|---|---|
| RSS | `/feed.xml`(선정), `/feed/full.xml`(선정 전문), `/feed/all.xml`(전체), `/feed/daily.xml` · `weekly` · `monthly`, `/feed/category/<key>.xml` | RSS 리더, 슬랙 RSS 앱, 사내 포털 위젯 |
| 공개 API | `/api/v1/items`, `/api/v1/hot-topics`, `/api/v1/stories/{id}`, `/api/v1/dailies/latest` 등 | 대시보드, 사내 봇, 데이터 분석 |
| 증분 동기화 | `/api/v1/selected/snapshot` + `/api/v1/selected/changes` | 선정 글 전체를 로컬에 복제해 두고 변경분만 받기 |
| 에이전트 Markdown | `/api/v1/agent`, `/api/v1/agent/latest`, `/api/v1/agent/search` 등 | 웹 페이지만 읽을 수 있는 에이전트 |
| MCP | `/api/mcp` (Streamable HTTP, 익명, 읽기 전용) | Claude Code, Codex 같은 에이전트의 도구 |
| `llms.txt` | `/llms.txt` | LLM과 검색 엔진에게 사이트 사용법 안내 |

API 문서는 `/openapi-v1.json`, 사람용 안내는 `/agent` 페이지에 있습니다. 모든 출구가 같은 공개 읽기 계층을 거치므로 "웹에서는 철회됐는데 API에는 남아 있다" 같은 불일치가 생기지 않도록 설계되어 있습니다.

아래 예제의 `https://lawhot.example`은 [활용 예시 ①](03-usage-industry-site.md)에서 만든 사이트라고 가정합니다. 남이 운영하는 공개 사이트에 붙일 때는 그 사이트의 이용 규칙(`/terms` 등)과 요청 빈도 안내를 먼저 확인합니다.

## 실제 예제

### 예제 1. 오늘의 선정 글을 가져오는 TypeScript 클라이언트

```ts
// hot-client.ts — Node.js 18+ (전역 fetch 사용)
type Item = {
  id: string;
  title: string;
  summary: string | null;
  source: { name: string };
  links: { aihot: string; original: string };
  publishedAt: string | null;
  category: string | null; // 앞으로 새 값이 생길 수 있으므로 문자열로 받는다
  score: number | null;
  selected: boolean;
  reason: string | null;
};
type ItemsResponse = { items: Item[]; page: { hasMore: boolean; nextCursor: string | null } };

const BASE = 'https://lawhot.example';
let etag: string | null = null;
let cached: ItemsResponse | null = null;

export async function fetchToday(category?: string): Promise<ItemsResponse> {
  const url = new URL('/api/v1/items', BASE);
  url.searchParams.set('mode', 'selected');
  url.searchParams.set('window', '24h');
  if (category) url.searchParams.set('category', category);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'lawhot-dashboard/1.0',
      ...(etag && cached ? { 'If-None-Match': etag } : {}),
    },
  });

  if (res.status === 304 && cached) return cached; // 바뀐 것이 없으면 이전 결과 재사용
  if (!res.ok) throw new Error(`items ${res.status}`);

  etag = res.headers.get('etag');
  cached = (await res.json()) as ItemsResponse;
  return cached;
}

const { items } = await fetchToday('ruling');
for (const it of items) console.log(`[${it.score}] ${it.title} — ${it.source.name}\n  ${it.links.original}`);
```

- `mode=selected`는 선정 글만, `mode=all`은 공개된 전체 글입니다. 기본은 `selected`, 기간은 `24h`와 `7d` 중에 고릅니다.
- `category`는 사이트의 분류 `key`입니다. 응답 스키마도 "앞으로 새 값이 생길 수 있다"고 명시하므로 클라이언트는 문자열로 받고 모르는 값을 허용해야 합니다.
- 응답에는 `ETag`와 `Cache-Control`이 붙습니다. `If-None-Match`로 다시 물으면 바뀌지 않았을 때 304가 옵니다. 같은 데이터는 매번 같은 바이트로 나오도록 정렬이 고정되어 있어서 ETag가 이유 없이 바뀌지 않습니다.
- 페이지가 더 있으면 `page.nextCursor`를 **같은 쿼리**에 붙여 다음 페이지를 받습니다.

### 예제 2. 선정 글 전체를 로컬에 복제하고 변경분만 받기

사내 검색 엔진이나 데이터 웨어하우스에 선정 글을 계속 쌓아야 한다면, 매번 목록을 다시 받는 대신 스냅샷 + 변경 로그 방식을 씁니다.

```ts
// selected-sync.ts
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://lawhot.example';
const STATE = './sync-state.json';

type Change =
  | { op: 'upsert'; changedAt: string; item: { id: string; title: string } }
  | { op: 'remove'; changedAt: string; id: string };

const store = new Map<string, { id: string; title: string }>(); // 실제로는 DB 테이블

async function getJson(path: string, params: Record<string, string>) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  return { status: res.status, body: res.ok ? await res.json() : null };
}

async function bootstrap(): Promise<string> {
  store.clear();
  let page: string | null = null;
  let cursor: string | null = null;
  do {
    const { body } = await getJson('/api/v1/selected/snapshot', { limit: '1000', ...(page ? { page } : {}) });
    cursor ??= body.cursor; // 반드시 "첫 페이지"의 cursor를 보관한다
    for (const item of body.items) store.set(item.id, item);
    page = body.hasMore ? body.nextPage : null;
  } while (page);
  return cursor!;
}

export async function sync() {
  let cursor: string | null = await readFile(STATE, 'utf8').then((s) => JSON.parse(s).cursor, () => null);
  if (!cursor) cursor = await bootstrap();

  for (;;) {
    const { status, body } = await getJson('/api/v1/selected/changes', { cursor, limit: '100' });
    if (status === 409) { cursor = await bootstrap(); continue; } // snapshot_required: 처음부터 다시
    for (const c of body.changes as Change[]) {
      if (c.op === 'upsert') store.set(c.item.id, c.item);
      else store.delete(c.id);
    }
    cursor = body.cursor;
    await writeFile(STATE, JSON.stringify({ cursor })); // 적용한 "뒤에" 저장한다
    if (!body.hasMore) break;
  }
}
```

1. **스냅샷은 한 번만** 받습니다. 첫 페이지의 `cursor`를 보관하고, 이후로는 `changes`만 따라갑니다. 스냅샷은 탐색용이 아니므로 주기적으로 다시 받지 않습니다.
2. **변경을 적용한 뒤에 cursor를 저장합니다.** 순서를 거꾸로 하면 적용 도중 죽었을 때 변경분을 잃습니다.
3. **cursor는 시간으로 만료되지 않습니다.** 며칠 꺼져 있어도 이어서 받을 수 있고, 이어받기가 안전하지 않을 때만 `409 snapshot_required`가 옵니다.
4. **`remove`도 반드시 처리합니다.** 같은 뉴스의 대표 보도가 바뀌거나 철회되면 이전 항목이 `remove`로 내려옵니다. 기계용 출구에서는 뉴스 하나당 대표 보도 하나만 나가기 때문입니다.

### 예제 3. 에이전트에 MCP로 연결하기

Claude Code라면 한 줄로 등록합니다.

```bash
claude mcp add --transport http lawhot https://lawhot.example/api/mcp
```

등록하면 사이트의 `mcpPrefix`를 앞에 붙인 일곱 개 도구가 보입니다.

| 도구 | 하는 일 | 주요 인자 |
|---|---|---|
| `lawhot_get_latest` | 최근 24시간·7일 브리핑 | `window`, `mode`, `category`, `limit`(최대 30) |
| `lawhot_search` | 특정 주제 검색 | `q`(2–200자), `window`, `category`, `limit` |
| `lawhot_get_hot_topics` | 현재 화제 사건 순위 | `limit`(최대 10) |
| `lawhot_get_story` | 사건 타임라인 | `public_id`(화제 사건 응답의 링크에서 얻음), `report_limit` |
| `lawhot_get_daily` / `_weekly` / `_monthly` | 리포트 | `date` / `week`(예: `2026-W40`) / `month` |

```text
> 이번 주 개인정보 관련 제재 소식을 정리하고, 가장 화제가 된 사건의 타임라인도 보여 줘.
  → lawhot_search(q: "개인정보 과징금", window: "7d")
  → lawhot_get_hot_topics() → lawhot_get_story(public_id: ...)
```

`get_story`의 `public_id`는 추측하지 말고 화제 사건 응답의 링크에서 얻으라고 도구 설명에 적혀 있습니다. 도구 응답은 외부 자료를 "신뢰할 수 없는 데이터"로 감싸 표시하므로, 기사 본문에 섞인 지시문이 에이전트에게 명령처럼 전달되지 않도록 한 번 더 막아 줍니다.

## 실제 서비스에서는

> 리서치 팀원은 아침에 사이트의 일간 리포트를 열거나 `/feed/daily.xml`을 RSS 리더로 받습니다. 사내 대시보드는 5분마다 `/api/v1/items?window=24h`를 `If-None-Match`와 함께 호출해 대부분 304로 끝나고, 새 선정 글이 있을 때만 화면을 갱신합니다. 검색 시스템은 `selected/changes`를 1시간마다 따라가며 색인을 갱신하고, 철회된 글은 `remove`를 받아 색인에서 지웁니다. 변호사가 Claude Code에서 "이번 주 판례 동향"을 물으면 에이전트가 MCP로 `lawhot_search`를 호출해 사이트와 같은 데이터로 답합니다.

읽는 쪽에서 기억할 점은 세 가지입니다.

- **오늘 목록만 필요하면 `/api/v1/items`로 충분합니다.** 스냅샷은 전체 복제가 필요한 경우에만 씁니다.
- **캐시 규칙을 지킵니다.** 공개 응답은 `Cache-Control` 만료 뒤 다시 확인해야 하고, MCP 응답은 `no-store`입니다. 중간에 CDN이나 프록시를 두더라도 만료를 늘리지 않는 것이 사이트 쪽 요구 사항입니다.
- **시간은 베이징 시간 기준입니다.** 일간 리포트의 날짜(`/api/v1/dailies/{date}`)는 상하이 달력 날짜이고, 발행 시각 설정도 베이징 시간입니다. 한국에서 쓸 때는 1시간 차이를 염두에 둡니다.

---

[← 활용 예시 ① 내 업계 사이트로 바꾸기](03-usage-industry-site.md) · [목차](README.md) · [활용 예시 ③ 운영과 실전 프로젝트 →](05-usage-operations.md)
