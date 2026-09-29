---
repository: firecrawl/firecrawl
url: https://github.com/firecrawl/firecrawl
stars: 185832
studiedAt: 2026-09-29
status: draft
---

# firecrawl/firecrawl

Firecrawl은 웹을 검색하고, 페이지를 스크랩하고, 페이지와 상호작용해서 결과를 LLM이 쓰기 좋은 Markdown이나 구조화된 JSON으로 돌려주는 웹 데이터 API입니다.
오픈소스(AGPL-3.0)로 공개되어 셀프호스팅할 수 있고, firecrawl.dev에서 호스팅 서비스로도 제공됩니다.

## 01. 어떤 문제를 푸는가

에이전트가 웹 정보를 쓰려면 페이지를 찾고, JavaScript를 렌더링하고, 프록시·차단·속도 제한을 처리한 뒤, 본문만 골라 모델에 넣어야 합니다.
Firecrawl은 이 과정을 API 호출 하나로 묶고, 출력 형식을 Markdown·JSON·스크린샷 등으로 맞춰 줍니다.

- 해결 대상 : 에이전트와 AI 앱이 웹 소스를 찾고 본문을 깨끗한 Markdown이나 구조화 데이터로 받는 문제[^s1]
- 처리해 주는 것 : 프록시 로테이션, 오케스트레이션, rate limit, JS로 막힌 콘텐츠 등을 설정 없이 처리한다고 README가 밝힘[^s1]
- 문서상 수치 : 웹의 96%를 커버하고, 수백만 페이지 기준 P95 지연이 3.4s라고 README가 주장함 (자체 벤치마크 인용)[^s1]
- 기본 정책 : robots.txt 지시를 기본으로 존중하며, 사이트 정책 준수 책임은 사용자에게 있다고 명시함[^s1]
- 라이선스 : 본체는 AGPL-3.0, SDK와 일부 UI 컴포넌트는 MIT[^s1]
- 저장소 : 웹 페이지 기준 공개 소개는 "The web data API to search, scrape, and interact at scale", 사이트는 firecrawl.dev[^s2]

## 02. 핵심 구조

저장소는 API 서버와 워커, 여러 언어 SDK, CLI, Skill 묶음을 담은 모노레포입니다.
셀프호스팅 스택은 Docker Compose 하나로 API와 워커, 브라우저 서비스, 큐·캐시 인프라를 함께 띄웁니다.

- 최상위 디렉터리 : `apps/`, `examples/`, `firecrawl-cli/`, `firecrawl-cli-skills/`, `firecrawl-skills/`, `firecrawl-workflows/`, `skills/`, `docker-compose.yaml`, `SELF_HOST.md`, `AGENTS.md`, `CLAUDE.md`[^s2]
- Compose 서비스 : API와 워커, Playwright, Redis, RabbitMQ, NuQ PostgreSQL, 선택 큐 백엔드용 FoundationDB. 호스트에는 API만 `3002` 포트로 공개함[^s3]
- 서비스 정의 : `api` 는 `apps/api` 에서 빌드, `playwright-service`, `redis` (`redis:alpine`), `rabbitmq` (`rabbitmq:3-management`), `nuq-postgres`, `foundationdb` (`foundationdb/foundationdb:7.3.63`)[^s5]
- 큐 : 기본은 NuQ PostgreSQL. `NUQ_BACKEND=fdb` 로 FoundationDB를 쓸 수 있으나 직접 운영해야 함[^s3]
- 스크래핑 엔진 : 기본은 번들 Playwright와 basic fetch fallback. Fire-engine 같은 별도 엔진은 필요할 때 연결함[^s3]
- AI 기능 : 기본 모델 제공자 없음. OpenAI, OpenAI 호환 엔드포인트, Ollama를 연결해서 씀[^s3]
- SDK : Python(`firecrawl-py`), Node.js(`firecrawl`), Go(`apps/go-sdk`), Java, Elixir, Rust, Ruby, .NET, PHP[^s1]
- 개발 환경 : 로컬 개발은 Node.js 22와 pnpm `11.4.0` 을 쓰고, `apps/api` 에서 `pnpm harness pnpm test:snips` 로 API·워커·PostgreSQL·RabbitMQ를 띄워 테스트함. 개발용 `apps/api/.env` 와 Compose용 루트 설정은 서로 다름[^s4]
- Skill 관리 : 제품 코드 통합용 build skill은 이 저장소 `skills/` 에서 작성하고 CI가 `firecrawl/skills` 카탈로그로 미러링함. 카탈로그 저장소에는 직접 PR하지 않음[^s1]

## 03. 주요 기능

README는 Search, Scrape, Interact를 핵심 엔드포인트로, Agent·Crawl·Map·Batch Scrape를 추가 기능으로 나눕니다.[^s1]
공식 문서는 여기에 Parse, Webhooks, Browser Sandbox를 더해 소개합니다.[^s6]

- Search : 웹을 검색하고 결과 페이지의 본문까지 받음[^s1]
- Scrape : URL 하나를 Markdown, HTML, 스크린샷, 구조화 JSON으로 변환함[^s1]
- Interact : 스크랩한 페이지에 AI 프롬프트나 코드로 클릭·입력 등을 수행함[^s1]
    - `POST /v2/scrape` 로 받은 `scrapeId` 에 `POST /v2/scrape/{scrapeId}/interact` 를 호출하며, 같은 `scrapeId` 에서 세션 상태가 유지됨[^s9]
    - 코드 모드는 Playwright(`"node"` 기본, `"python"`)와 agent-browser(`"bash"`)를 지원함[^s9]
    - 응답에 `liveViewUrl`, `interactiveLiveViewUrl`, `cdpUrl`, `stdout`/`stderr`, `exitCode`, `killed` 등이 포함됨[^s9]
    - `profile: { name, saveChanges: true }` 로 쿠키·localStorage·세션 상태를 세션 간에 유지함. 저장 가능한 세션은 동시에 하나뿐임[^s9]
- Agent : URL 없이 필요한 데이터를 설명하면 검색·탐색·수집을 수행함. `/extract` 엔드포인트의 후속 기능[^s1]
    - 주요 파라미터 : `prompt` (최대 10,000자), `urls`, `schema` (Pydantic/Zod), `effort` (`low`/`medium`/`high`), `maxCredits` (기본 2,500), `webhook`[^s8]
    - 비동기 작업이며 상태는 `processing`, `completed`, `failed`. 결과는 24시간 동안 조회 가능함[^s8]
- Crawl : 사이트 전체 URL을 한 요청으로 스크랩하고 Job ID를 반환함. SDK가 폴링을 대신 처리함[^s1]
- Map : 사이트의 URL 목록을 빠르게 찾음. `search` 인자로 관련도 순 정렬을 받을 수 있음[^s1]
- Batch Scrape : 여러 URL을 비동기로 한 번에 스크랩함[^s1]
- Parse : 로컬 PDF, DOCX, ODT, XLSX, HTML 파일을 최대 50 MB까지 업로드해 변환함 (v2.10 추가, v2.11.0에서 PDF 상한 50 MB)[^s10]
- 에이전트 연동 : `npx -y firecrawl-cli@latest init --all --browser` 로 Skill과 CLI를 설치하거나, `firecrawl-mcp` MCP 서버를 등록함[^s1]

## 04. 시작하기

클라우드 API는 firecrawl.dev에서 API 키를 받아 SDK로 호출하면 됩니다.[^s1]
문서에 따르면 키 없이도 초기 요청은 무료로 쓸 수 있고, API 키를 등록하면 rate limit이 올라간다고 합니다.[^s6]

```bash
# Python SDK 설치
pip install firecrawl-py
# Node.js SDK 설치
npm install firecrawl
```

```python
from firecrawl import Firecrawl

app = Firecrawl(api_key="fc-YOUR_API_KEY")

# URL 하나를 Markdown으로 스크랩
doc = app.scrape("https://firecrawl.dev", formats=["markdown"])
print(doc.markdown)

# 사이트 크롤 (완료될 때까지 SDK가 대기)
docs = app.crawl("https://docs.firecrawl.dev", limit=50)

# 웹 검색 후 결과 본문까지 받기
results = app.search("firecrawl", limit=5)
```

위 예제는 README의 Python SDK 예제를 줄인 것입니다.[^s1]
MCP 클라이언트에는 다음 설정을 넣으면 됩니다.[^s1]

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY" }
    }
  }
}
```

셀프호스팅은 정확한 릴리스 태그를 체크아웃한 뒤 Docker Compose로 띄웁니다.[^s7]
첫 실행은 인증을 끄고(`USE_DB_AUTHENTICATION=false`) 기본 구성으로 스크랩 하나를 성공시키는 것부터 권합니다.[^s3]

```bash
# 소스 받기 (문서 예시 태그)
git clone https://github.com/firecrawl/firecrawl.git
cd firecrawl
git checkout v2.11.162
# 루트 .env 에 USE_DB_AUTHENTICATION=false, POSTGRES_PASSWORD 등을 채운 뒤 실행
docker compose up --build -d
```

```bash
# 상태 확인
docker compose ps --all
curl http://localhost:3002/v0/health/readiness
# 스크랩 스모크 테스트
curl -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "formats": ["markdown"], "timeout": 60000}'
```

(루트 `.env` 는 `docker-compose.yaml` 이 참조하는 변수만 덮어씁니다. `apps/api/.env.example` 을 Compose용으로 그대로 쓰면 안 된다고 안내합니다.[^s3])

## 05. 최근 변화

최근 GitHub Release 3개는 2026-04-10, 2026-05-15, 2026-06-19에 나왔습니다.
v2.11.0 이후의 기능 발표는 공식 changelog에만 올라와 있습니다.

- v2.11.0 (2026-06-19)[^s10]
    - Firecrawl Research Index (arXiv 논문 3M+와 GitHub 코드), `/scrape`·`/search`·`/interact`·`/parse` 키 없는 접근
    - 자동 PII 제거 옵션, LLM 호출 없이 구조화 출력을 만드는 `deterministicJson` 포맷
    - 브라우저 직접 제어용 `cdpUrl`, Monitor의 AI 목표 기반 알림과 필드 단위 JSON diff, PDF 상한 30 MB → 50 MB
- v2.10 (2026-05-15)[^s10]
    - `/parse` 엔드포인트, index에서만 결과를 주는 Lockdown Mode, `question`·`highlights`·`video` 포맷
    - `/search` 도메인 필터(`includeDomains`, `excludeDomains`), `robotsUserAgent` 지원
    - Go, Ruby, PHP, .NET 공식 SDK 추가, Rust SDK v2 승격
    - `/v0/scrape`, `/v0/crawl`, `/v1/extract`, `/v1/deep-research` deprecated
- v2.9.0 (2026-04-10)[^s10]
    - `/interact` 엔드포인트, `query`·`audio` 포맷, `onlyCleanContent` 파라미터
    - PDF 파싱 모드(`fast`, `auto`, `ocr`)와 `maxPages`, Java·Elixir SDK 추가
    - `/extract` 를 `/agent` 로 대체, `persistentSession` → `profile`, `writeMode` → `saveChanges` 이름 변경
- changelog 발표 (v2.11.0 이후)[^s11]
    - 2026-07-01 Web-scale `/monitor`, 2026-07-22 새 `/search` 관련도 모델
    - 2026-08-13 Research Index에 생명과학 논문 41M+ 추가, 2026-08-20 Firecrawl Developer Index
    - 2026-09-22 Alexandria 공개와 $75M Series B 발표

## 06. 커뮤니티에서 반복되는 주제

열린 이슈는 89건(2026-09-29 검색 API 기준)이며, 빈 템플릿이나 스팸 이슈가 적지 않습니다.[^s12]
내용이 있는 이슈는 셀프호스팅 기동 문제, SDK와 API 사이의 옵션 불일치, 파싱·추출 품질에 모여 있습니다.

- 셀프호스팅 기동 : RabbitMQ healthcheck가 약 20초 안에 끝나지만 RabbitMQ 부팅에 19~21초가 걸려 cold start의 약 67%가 실패했다는 보고. `start_period` 를 늘리는 우회가 제시됨. PostgreSQL 준비 확인 관련 #4595, #4643과 비슷한 문제로 언급됨[^s15]
- 셀프호스팅 운영 : 부하가 계속될 때 Node가 PID 1로 돌며 zombie 프로세스가 쌓인다는 이슈, 셀프호스팅 Playwright가 리다이렉트 후 최종 URL을 돌려주지 않는다는 이슈[^s12]
- 로컬 모델 추출 : Ollama(qwen2.5:7b, 16k 컨텍스트)로 JSON 추출 시 45,757토큰 프롬프트가 8,194토큰으로 잘리며 지시와 스키마가 빠져 잘못된 값이 나온다는 보고. 코드에 `trimToTokenLimit` 가 있지만 JSON 추출 경로에서 쓰이지 않는다고 지적함 (v2.11.343 셀프호스팅)[^s13]
- PDF 파싱 비결정성 : 바이트가 같은 440,883바이트 PDF를 일곱 번 읽어 169, 171, 172, 174줄 네 가지 결과가 나왔다는 보고. 내용 손실은 없고 줄바꿈 차이로 보이며, `pdf-parse` 가 `^1.1.1` 에 고정된 점을 짚음[^s14]
- SDK 누락 : JS SDK v2 `scrape()` 의 `zeroDataRetention` 거부, JS·Python SDK의 `recordSession` 누락, Node.js SDK `MapOptions` 의 `ignoreCache` 누락, Rust SDK의 에러 메시지 형식[^s12]
- 기타 요청 : 실패한 webhook 재전송 기능, `SCRAPE_SITE_ERROR` 의 구조화된 원인 필드, `firecrawl init` 템플릿 404, 무료 등급 "no limits" 표현에 대한 문제 제기[^s12]

## 07. 한계와 주의점

- 셀프호스팅에는 Fire-engine 안티봇 서비스가 포함되지 않음. 스크린샷·페이지 actions는 Fire-engine이 필요하다고 문서가 밝힘[^s7]
- Agent, Browser, Interact 모드와 menu·audio·video 같은 특수 포맷은 클라우드 전용임. 셀프호스팅 기본 스택에서 동작하는 것은 scrape, crawl, map, search 경로임[^s7]
- 기본 셀프호스팅 API는 인증이 없음. `USE_DB_AUTHENTICATION` 만 바꾸는 것으로는 인증된 배포가 완성되지 않음[^s3]
- 루트 Compose 파일은 NuQ PostgreSQL, Redis, RabbitMQ에 영속 볼륨을 정의하지 않음. TLS, 고가용성, 백업은 직접 구성해야 함[^s3]
- 큐 관리 UI는 기본 꺼짐이며, 켤 때는 강한 `BULL_AUTH_KEY` 와 네트워크 제한이 필요함[^s3]
- Agent는 Research Preview 단계. 한 번 실행에 약 150~200행이 나오며, 큰 작업은 실행당 3~5개 URL로 나누라고 권함[^s8]
- Agent 모델 설명이 문서마다 다름. README는 `model`·`effort` 가 모두 없으면 `spark-1-pro` 로 실행된다고 적었고, 공식 문서는 기본값이 `spark-2` 이며 Spark 1 모델은 deprecated되어 Spark 2로 라우팅된다고 적음[^s1][^s8]
- Interact 과금은 코드만 쓰면 세션 분당 2 credit, AI 프롬프트를 쓰면 분당 7 credit. 세션은 10분 TTL 또는 5분 비활성 시 만료됨[^s9]
- AGPL-3.0이므로 서버를 수정해 서비스로 제공할 때 라이선스 조건을 따로 검토해야 함. SDK는 MIT[^s1]

## 08. 더 알아볼 것

- Open Source와 Cloud의 기능 차이는 README에서 이미지로만 제공되어 표 내용을 텍스트로 확인하지 못했습니다.
- 클라우드 요금제와 credit 단가, rate limit 수치는 이번 조사에서 확인하지 못했습니다.
- GitHub Release 최신은 v2.11.0(2026-06-19)이지만 문서와 이슈에는 v2.11.162, v2.11.343 같은 태그가 나옵니다. 패치 태그의 배포 방식과 변경 내역은 확인하지 못했습니다.
- Fire-engine을 셀프호스팅 스택에 연결하는 방법과 공개 여부는 확인하지 못했습니다.
- 2026-09-22 발표된 Alexandria가 API에서 어떤 엔드포인트로 노출되는지는 확인하지 못했습니다.
- 리포트 기준(2026-09-28) Star 185,527개, 24시간 증가 +416입니다. 조사 시점(2026-09-29) API 값은 185,832개로 리포트 대비 305개 많습니다.

## 참고 자료

- [Firecrawl README (main)](https://github.com/firecrawl/firecrawl/blob/main/README.md) (readme)
- [firecrawl/firecrawl 저장소 페이지](https://github.com/firecrawl/firecrawl) (website)
- [SELF_HOST.md](https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md) (code)
- [CONTRIBUTING.md](https://github.com/firecrawl/firecrawl/blob/main/CONTRIBUTING.md) (code)
- [docker-compose.yaml](https://github.com/firecrawl/firecrawl/blob/main/docker-compose.yaml) (code)
- [Firecrawl Docs: Introduction](https://docs.firecrawl.dev/introduction) (docs)
- [Firecrawl Docs: Self-hosting](https://docs.firecrawl.dev/contributing/self-host) (docs)
- [Firecrawl Docs: Agent](https://docs.firecrawl.dev/features/agent) (docs)
- [Firecrawl Docs: Interact](https://docs.firecrawl.dev/features/interact) (docs)
- [최근 Release 3개 (GitHub API)](https://api.github.com/repos/firecrawl/firecrawl/releases?per_page=3) (release)
- [Firecrawl Changelog](https://firecrawl.dev/changelog) (website)
- [열린 Issues (GitHub 검색 API, 최근 생성순)](https://api.github.com/search/issues?q=repo:firecrawl/firecrawl+is:issue+is:open&sort=created&order=desc&per_page=30) (issues)
- [Issue #4653: JSON extraction truncates instructions with local models](https://github.com/firecrawl/firecrawl/issues/4653) (issues)
- [Issue #4712: PDF scrape returns different line counts for same file](https://github.com/firecrawl/firecrawl/issues/4712) (issues)
- [Issue #4750: RabbitMQ healthcheck times out before boot](https://github.com/firecrawl/firecrawl/issues/4750) (issues)

[^s1]: [Firecrawl README (main)](https://github.com/firecrawl/firecrawl/blob/main/README.md)
[^s2]: [firecrawl/firecrawl 저장소 페이지](https://github.com/firecrawl/firecrawl)
[^s3]: [SELF_HOST.md](https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md)
[^s4]: [CONTRIBUTING.md](https://github.com/firecrawl/firecrawl/blob/main/CONTRIBUTING.md)
[^s5]: [docker-compose.yaml](https://github.com/firecrawl/firecrawl/blob/main/docker-compose.yaml)
[^s6]: [Firecrawl Docs: Introduction](https://docs.firecrawl.dev/introduction)
[^s7]: [Firecrawl Docs: Self-hosting](https://docs.firecrawl.dev/contributing/self-host)
[^s8]: [Firecrawl Docs: Agent](https://docs.firecrawl.dev/features/agent)
[^s9]: [Firecrawl Docs: Interact](https://docs.firecrawl.dev/features/interact)
[^s10]: [최근 Release 3개 (GitHub API)](https://api.github.com/repos/firecrawl/firecrawl/releases?per_page=3)
[^s11]: [Firecrawl Changelog](https://firecrawl.dev/changelog)
[^s12]: [열린 Issues (GitHub 검색 API, 최근 생성순)](https://api.github.com/search/issues?q=repo:firecrawl/firecrawl+is:issue+is:open&sort=created&order=desc&per_page=30)
[^s13]: [Issue #4653: JSON extraction truncates instructions with local models](https://github.com/firecrawl/firecrawl/issues/4653)
[^s14]: [Issue #4712: PDF scrape returns different line counts for same file](https://github.com/firecrawl/firecrawl/issues/4712)
[^s15]: [Issue #4750: RabbitMQ healthcheck times out before boot](https://github.com/firecrawl/firecrawl/issues/4750)
