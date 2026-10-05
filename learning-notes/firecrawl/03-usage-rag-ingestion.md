# Firecrawl 활용 예시 ① 문서 사이트를 RAG 지식베이스로 만들기

> 제품 문서 사이트를 Map → Crawl로 수집하고, Markdown 제목 단위로 나눠 벡터 DB에 넣는 과정과, 바뀐 페이지만 다시 반영하는 방법을 다룹니다.

## 요구사항

> 고객 지원 챗봇이 회사 문서 사이트(`https://docs.example.com`, 약 400페이지)를 근거로 답하게 하고 싶다. 문서는 Next.js로 만들어져 일부 내용이 클라이언트에서 렌더링된다. `/blog`, `/changelog`는 제외한다. 매일 새벽 한 번 다시 수집하되, 바뀌지 않은 페이지는 임베딩을 다시 만들지 않는다. 답변에는 원문 링크를 붙인다.

Firecrawl이 RAG에서 가장 자주 쓰이는 형태입니다. 핵심은 세 가지입니다.

- 수집 범위를 정확히 묶어 비용을 예측 가능하게 한다.
- 제목 구조가 살아 있는 Markdown을 받아, 의미 단위로 청크를 나눈다.
- 페이지 내용 해시로 변경 여부를 판단해 임베딩 비용을 아낀다.

---

## 구현

### 1단계: Map으로 범위 확인

Crawl부터 돌리면 예상보다 많은 페이지가 수집되어 credit을 낭비하기 쉽습니다. 먼저 Map으로 URL 목록을 보고 경로 필터를 정합니다.

```ts
// scripts/preview-scope.ts
import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

const { links } = await firecrawl.map('https://docs.example.com', { limit: 5000 });

const byPrefix = new Map<string, number>();
for (const { url } of links) {
  const prefix = new URL(url).pathname.split('/')[1] || '(root)';
  byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
}
console.table([...byPrefix].map(([prefix, count]) => ({ prefix, count })));
// guides 180, api 150, blog 260, changelog 90 ... 같은 분포를 보고 필터를 정한다
```

### 2단계: Crawl로 본문 수집

```ts
// src/ingest/crawl-docs.ts
import { Firecrawl, type Document } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

export async function crawlDocs(): Promise<Document[]> {
  const job = await firecrawl.crawl('https://docs.example.com', {
    limit: 600,                              // 예상(약 400)보다 약간 크게. 상한이 곧 비용 상한
    excludePaths: ['^/blog/.*', '^/changelog/.*'],
    ignoreQueryParameters: true,             // ?tab=ts 같은 변형을 같은 페이지로 취급
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      excludeTags: ['.feedback-widget', '#cookie-banner'],
      maxAge: 0,                             // 매일 수집이므로 캐시 대신 최신 내용
    },
    pollInterval: 5,                         // SDK가 5초마다 상태 확인
    timeout: 1800,                           // 30분 안에 끝나지 않으면 예외
  });

  if (job.status !== 'completed') {
    throw new Error(`crawl ended with status ${job.status}`);
  }
  return job.data.filter((d) => d.markdown && (d.metadata?.statusCode ?? 200) < 400);
}
```

### 3단계: 제목 기준 청크 나누기

```ts
// src/ingest/chunk.ts
export type Chunk = { url: string; title: string; heading: string; text: string };

const MAX_CHARS = 2000;

export function chunkMarkdown(url: string, title: string, markdown: string): Chunk[] {
  const chunks: Chunk[] = [];
  // h2/h3 경계에서 자른다. Firecrawl Markdown은 원문의 제목 계층을 유지한다
  const sections = markdown.split(/\n(?=#{2,3} )/);

  for (const section of sections) {
    const heading = section.match(/^#{2,3} (.+)/)?.[1] ?? title;
    for (let i = 0; i < section.length; i += MAX_CHARS) {
      const text = section.slice(i, i + MAX_CHARS).trim();
      if (text.length > 50) chunks.push({ url, title, heading, text });
    }
  }
  return chunks;
}
```

### 4단계: 바뀐 페이지만 임베딩해서 저장

```ts
// src/ingest/run.ts
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import pg from 'pg';
import { crawlDocs } from './crawl-docs';
import { chunkMarkdown } from './chunk';

const openai = new OpenAI();
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function runIngest() {
  const docs = await crawlDocs();
  const seen = new Set<string>();

  for (const doc of docs) {
    const url = doc.metadata!.sourceURL!;
    const hash = sha256(doc.markdown!);
    seen.add(url);

    const { rows } = await db.query('SELECT content_hash FROM pages WHERE url = $1', [url]);
    if (rows[0]?.content_hash === hash) continue; // 내용이 같으면 임베딩 생략

    const chunks = chunkMarkdown(url, doc.metadata?.title ?? url, doc.markdown!);
    const { data } = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks.map((c) => `${c.title} > ${c.heading}\n\n${c.text}`),
    });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM chunks WHERE url = $1', [url]);
      for (const [i, c] of chunks.entries()) {
        await client.query(
          'INSERT INTO chunks (url, title, heading, text, embedding) VALUES ($1, $2, $3, $4, $5)',
          [c.url, c.title, c.heading, c.text, JSON.stringify(data[i].embedding)],
        );
      }
      await client.query(
        `INSERT INTO pages (url, content_hash, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (url) DO UPDATE SET content_hash = $2, updated_at = now()`,
        [url, hash],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // 이번 수집에 없던 페이지는 문서에서 삭제된 것으로 보고 정리
  await db.query('DELETE FROM chunks WHERE url <> ALL($1::text[])', [[...seen]]);
  await db.query('DELETE FROM pages WHERE url <> ALL($1::text[])', [[...seen]]);
}
```

---

## 실행 흐름

```text
스케줄러(매일 03:00): runIngest()
 ↓
Firecrawl crawl: docs.example.com, blog·changelog 제외, 최대 600페이지
 ↓  (서버: 링크 탐색 → 페이지마다 엔진 선택 → 렌더링 → 본문 Markdown)
SDK: 완료까지 5초 간격 폴링 → Document[] 반환
 ↓
페이지마다 Markdown 해시 비교
 ├─ 같음 → 건너뜀
 └─ 다름 → h2/h3 단위 청크 → 임베딩 → 트랜잭션으로 교체
 ↓
이번에 보이지 않은 URL 삭제
 ↓
챗봇: 질문 임베딩 → pgvector 유사도 검색 → 청크 + sourceURL로 답변
```

---

## 코드 설명

1. **Map을 먼저 쓰는 이유**: Map은 본문을 가져오지 않아 싸고 빠릅니다. 경로별 페이지 수를 보고 나서 `excludePaths`를 정하면, "블로그 260페이지까지 수집했다" 같은 사고를 막을 수 있습니다.
2. **`limit`은 비용 상한입니다**: Crawl은 기본 Scrape 기준 페이지당 1 credit이므로 `limit`이 곧 최대 비용입니다. 예상치보다 조금 크게 잡고, 수집된 페이지 수가 `limit`에 닿으면 경로 필터를 다시 확인합니다.
3. **`maxAge: 0`**: 기본값(2일)이면 캐시된 결과가 돌아올 수 있습니다. 매일 수집하는 목적은 최신 반영이므로 캐시를 끕니다. 반대로 초기 대량 수집이라면 기본값을 두어 속도를 얻는 선택도 가능합니다.
4. **`excludeTags`**: `onlyMainContent`가 대부분의 잡음을 걷어내지만, 본문 안에 들어간 "이 문서가 도움이 되었나요?" 위젯 같은 요소는 사이트별로 직접 빼야 합니다. 한 번 정해 두면 400페이지 전체에 적용됩니다.
5. **제목 단위 청크**: Firecrawl Markdown은 `##`, `###` 계층과 코드 블록을 유지합니다. 고정 길이로 자르는 것보다 제목 경계에서 자르면 검색된 청크가 하나의 주제를 담게 되어 답변 품질이 좋아집니다. 청크 앞에 `제목 > 소제목`을 붙여 임베딩하면 짧은 섹션도 맥락을 잃지 않습니다.
6. **해시 비교**: 400페이지 중 하루에 바뀌는 페이지는 보통 몇 개입니다. 크롤 비용은 그대로 내지만, 임베딩과 DB 쓰기는 바뀐 페이지만 합니다.

---

## 왜 이렇게 사용하는가?

직접 Playwright로 같은 일을 하면 "링크 탐색, 중복 URL 정리, 동시성 제한, 렌더링 대기, 본문 추출 규칙, 실패 페이지 재시도"를 모두 만들어야 합니다. 이 예제에서 Firecrawl이 맡은 부분은 `crawlDocs()` 하나이고, 나머지 코드는 **RAG에서 어차피 내가 결정해야 하는 것**(청크 전략, 임베딩 모델, 변경 감지, 저장 방식)입니다. 수집을 외부에 맡기고 검색 품질에 집중할 수 있다는 것이 Firecrawl을 RAG에 쓰는 가장 큰 이유입니다.

다만 문서 사이트가 이미 Markdown 원본을 Git에 두고 있다면(예: Docusaurus, MkDocs 저장소), 저장소를 직접 읽는 편이 더 정확하고 비용도 없습니다. Firecrawl은 **원본에 접근할 수 없고 렌더링된 웹페이지만 있을 때** 가장 가치가 큽니다.

페이지 수가 수천 개로 커지면 SDK 폴링 대신 Webhook으로 페이지 단위 이벤트를 받아 처리하는 편이 낫습니다. 그 구조는 [서버 수집 파이프라인과 운영](05-usage-server-pipeline.md)에서 다룹니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② AI 에이전트에 웹 도구 연결하기 →](04-usage-agent-tools.md)
