# Firecrawl 설치와 첫 사용

> 클라우드 API와 셀프호스팅 중 무엇으로 시작할지, SDK 설치와 기본 설정, 가장 간단한 첫 호출, 설치할 때 자주 겪는 문제를 다룹니다.

## 먼저 고를 것: 클라우드인가 셀프호스팅인가

| 항목 | 클라우드 (`api.firecrawl.dev`) | 셀프호스팅 (Docker Compose) |
|---|---|---|
| 시작 시간 | API 키 발급 후 바로 | 이미지 빌드와 설정에 수십 분 |
| 엔진 | 캐시 인덱스 + Fire-engine + fetch | Playwright + fetch |
| 사용 가능 기능 | 전체 (Agent, Interact, 스크린샷, actions 포함) | Scrape, Crawl, Map, Search(별도 검색 백엔드 연결 시) 중심 |
| 비용 | credit 단위 과금 | 서버·운영 인력 비용 |
| 데이터 경로 | 대상 사이트 ↔ Firecrawl ↔ 내 앱 | 대상 사이트 ↔ 내 인프라 |

처음 배울 때는 **클라우드로 시작해 동작을 익히고**, 데이터 반출 제약이 있을 때 셀프호스팅을 검토하는 순서를 권합니다. 셀프호스팅에서는 이 문서의 일부 예제(Agent, Interact, 스크린샷)가 동작하지 않습니다.

---

## 설치

**Node.js SDK** (Node.js 22 이상 필요)

```bash
npm install firecrawl zod
```

```bash
pnpm add firecrawl zod
```

`zod`는 필수는 아니지만, JSON 추출 스키마를 Zod로 쓰면 SDK가 JSON Schema로 변환해 보내 주므로 함께 설치하는 경우가 많습니다.

**Python SDK** (Python 3.8 이상)

```bash
pip install firecrawl-py
```

```bash
uv add firecrawl-py
```

**CLI와 에이전트 Skill**

```bash
npx -y firecrawl-cli@latest init --all --browser
```

Claude Code 같은 에이전트 하네스에 Firecrawl CLI와 Skill을 한 번에 설치합니다. MCP 서버를 쓰는 방법은 [AI 에이전트에 웹 도구 연결하기](04-usage-agent-tools.md)에서 다룹니다.

2026년 10월 기준 최신 버전은 npm `firecrawl` 4.42.x, PyPI `firecrawl-py` 4.46.x입니다. SDK는 거의 매주 패치가 나오므로, 운영 코드에서는 lockfile로 버전을 고정합니다.

---

## 기본 설정

API 키는 firecrawl.dev에서 가입하면 발급됩니다(`fc-`로 시작). 코드에 직접 쓰지 말고 환경 변수로 둡니다.

```bash
# .env
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxx
# 셀프호스팅 서버를 쓸 때만
# FIRECRAWL_API_URL=http://localhost:3002
```

Node.js SDK의 클라이언트 옵션은 다음과 같습니다.

```ts
import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY, // 없으면 FIRECRAWL_API_KEY 환경 변수를 읽음
  apiUrl: process.env.FIRECRAWL_API_URL, // 없으면 https://api.firecrawl.dev
  timeoutMs: 60_000,                     // 요청 하나의 HTTP 타임아웃
  maxRetries: 3,                         // 일시적 실패 자동 재시도
  backoffFactor: 0.5,                    // 재시도 간격의 지수 백오프 계수
});
```

API 키 없이도 `scrape`, `search`, `interact`, `parse`는 IP당 하루 한도 안에서 체험할 수 있습니다. 하지만 한도가 작고 IP 단위라 서버에서 쓰기에는 맞지 않습니다. 가입하면 무료 1,000 credit과 더 높은 rate limit이 주어집니다.

---

## 가장 간단한 예제

```ts
// first-scrape.ts
import { Firecrawl } from 'firecrawl';

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

const doc = await firecrawl.scrape('https://docs.firecrawl.dev/introduction', {
  formats: ['markdown', 'links'],
  onlyMainContent: true,
});

console.log(doc.metadata?.title);
console.log(doc.metadata?.statusCode, doc.metadata?.cacheState);
console.log(doc.markdown?.slice(0, 500));
console.log(`링크 ${doc.links?.length ?? 0}개`);
```

```bash
npx tsx first-scrape.ts
```

1. **무엇을 생성하는가**: `Firecrawl` 클라이언트를 만들고, 한 페이지에 대한 Scrape 요청을 보냅니다.
2. **어떤 값을 전달하는가**: 대상 URL과 받고 싶은 형식(`markdown`, `links`), 본문만 남길지(`onlyMainContent`)를 전달합니다.
3. **Firecrawl이 무엇을 처리하는가**: 서버가 캐시 인덱스를 먼저 확인하고, 없으면 브라우저 엔진으로 페이지를 렌더링한 뒤 내비게이션·푸터를 걷어내고 Markdown과 링크 목록을 만듭니다.
4. **어떤 결과를 반환하는가**: `Document` 객체가 옵니다. `markdown`, `links`, 그리고 `metadata`(`title`, `sourceURL`, `statusCode`, `cacheState`, `creditsUsed` 등)가 들어 있습니다. 요청하지 않은 `html`이나 `screenshot`은 없습니다.

같은 일을 Python으로 하면 다음과 같습니다.

```python
import os
from firecrawl import Firecrawl

firecrawl = Firecrawl(api_key=os.environ["FIRECRAWL_API_KEY"])
doc = firecrawl.scrape("https://docs.firecrawl.dev/introduction", formats=["markdown", "links"])
print(doc.metadata.title, doc.markdown[:500])
```

Python SDK는 필드 이름을 snake_case(`source_url`, `scrape_id`)로 노출합니다. Node.js는 API와 같은 camelCase(`sourceURL`, `scrapeId`)입니다.

---

## 셀프호스팅으로 첫 실행하기

```bash
git clone https://github.com/firecrawl/firecrawl.git
cd firecrawl
git checkout v2.11.162   # 공식 셀프호스팅 가이드가 검증한 태그. main을 그대로 쓰지 않는다

cat > .env <<'EOF'
USE_DB_AUTHENTICATION=false
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-at-least-32-random-characters
POSTGRES_DB=postgres
EOF

docker compose up --build -d
docker compose ps --all
curl http://localhost:3002/v0/health/readiness
```

```bash
curl -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "formats": ["markdown"], "timeout": 60000}'
```

Compose는 API·워커, Playwright 서비스, Redis, RabbitMQ, NuQ PostgreSQL(작업 큐), 선택용 FoundationDB를 띄우고, 호스트에는 API의 `3002` 포트만 엽니다. SDK에서는 `apiUrl: 'http://localhost:3002'`로 연결합니다.

LLM이 필요한 기능(`json` 추출, `summary`)을 쓰려면 `.env`에 `OPENAI_API_KEY`(또는 `OPENAI_BASE_URL`), `OLLAMA_BASE_URL`, `MODEL_NAME` 중 맞는 값을 넣습니다. 검색은 `SEARXNG_ENDPOINT`로 SearXNG 같은 검색 백엔드를 연결해야 합니다.

---

## 설치할 때 주의할 점

- **Node.js 버전**: `firecrawl` 4.x는 `engines.node >= 22`입니다. Node 18·20 런타임(오래된 서버리스 런타임 등)에서는 설치 경고나 런타임 오류가 날 수 있습니다.
- **패키지 이름 혼동**: Node.js는 `firecrawl`, Python은 `firecrawl-py`입니다. 예전 글의 `@mendable/firecrawl-js`, `FirecrawlApp` 클래스는 v1 시절 이름이므로 새 코드에서는 `Firecrawl` 클래스와 v2 메서드(`scrape`, `crawl`)를 씁니다.
- **API 키 노출**: 키는 계정 credit을 그대로 쓰므로 프런트엔드 번들이나 공개 저장소에 넣지 않습니다. 브라우저에서 필요하면 내 서버를 거쳐 호출합니다.
- **셀프호스팅 `.env` 혼동**: 루트 `.env`는 `docker-compose.yaml`이 참조하는 변수만 덮어씁니다. 개발용 `apps/api/.env.example`을 그대로 복사하면 안 됩니다.
- **셀프호스팅 첫 기동 실패**: RabbitMQ·PostgreSQL이 준비되기 전에 API가 먼저 떠서 실패하는 사례가 보고되어 있습니다. `docker compose ps --all`로 상태를 보고, 필요하면 healthcheck의 `start_period`를 늘리거나 다시 `up`합니다.
- **셀프호스팅 인증**: 기본 API는 인증이 없습니다. `USE_DB_AUTHENTICATION=true`로 바꾸는 것만으로는 인증된 배포가 완성되지 않으므로, 신뢰할 수 있는 내부 네트워크 밖으로 포트를 열지 않습니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 문서 사이트를 RAG 지식베이스로 만들기 →](03-usage-rag-ingestion.md)
