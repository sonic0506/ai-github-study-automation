---
repository: unclecode/crawl4ai
url: https://github.com/unclecode/crawl4ai
stars: 84408
studiedAt: 2026-09-29
status: draft
---

# unclecode/crawl4ai

Crawl4AI는 웹사이트를 LLM이 읽기 좋은 Markdown으로 바꿔 주는 오픈소스 웹 크롤러·스크레이퍼입니다.
Python 라이브러리, 직접 띄우는 Docker 서버, 호스팅형 Crawl4AI Cloud 세 가지 방식으로 쓸 수 있고, 저장소에는 앞의 두 가지가 들어 있습니다.

## 01. 어떤 문제를 푸는가

RAG, AI 에이전트, 데이터 파이프라인은 웹 페이지를 그대로 넣기보다 정리된 텍스트를 받아야 다루기 쉽습니다.
Crawl4AI는 실제 브라우저로 페이지를 열고, 메뉴·푸터 같은 군더더기를 걷어 낸 Markdown이나 구조화된 JSON으로 돌려주는 역할을 맡습니다.

- 해결 대상 : 웹사이트를 RAG·AI 에이전트·데이터 파이프라인용 LLM-ready Markdown으로 바꾸는 일[^s1]
- 출발점 : 2023년 작성자가 web-to-Markdown 도구를 찾다가 계정·API 토큰·16달러를 요구하는 "오픈소스" 도구에 만족하지 못해 직접 만들었다고 README에 적혀 있음[^s1]
- 공식 문서는 v0.9.x 기준이며, "Democratize Data: Free to use, transparent, and highly configurable"를 방향으로 내세움. 필수 API 키 없이 쓰는 것을 목표로 둠[^s4]
- 사용 방식 세 가지 : Python 프로세스 안의 라이브러리, 직접 운영하는 Docker 서버, 브라우저를 대신 돌려 주는 Crawl4AI Cloud[^s1]
- 라이브러리와 자체 서버는 무료이고, Cloud는 종량제임. 2026-12-31까지 첫 10달러 크레딧을 카드 없이 제공한다고 함[^s1]
- 라이선스는 Apache License 2.0. README는 배지나 문구로 출처를 표시하라는 Attribution 요구 사항을 따로 둠[^s1]
- 저장소 페이지 표시값은 Star 84.2k, Fork 8.7k, Watcher 418, 열린 이슈 33건, PR 154건, 커밋 1,696개 (2026-09-29 조회)[^s2]
- Python 3.10 이상이 필요하고, 분류자에는 3.10~3.13과 `Development Status :: 4 - Beta` 가 적혀 있음[^s3]

## 02. 핵심 구조

사용자는 크롤러 객체 하나에 브라우저 설정과 실행 설정을 따로 넘기는 구조로 씁니다.
콘텐츠 정리와 데이터 추출은 전략(strategy) 객체를 끼워 넣는 방식이라 필요한 단계만 바꿀 수 있습니다.

- AsyncWebCrawler : headless 브라우저를 띄워 페이지를 가져오는 비동기 크롤러 본체[^s6]
- BrowserConfig : headless 여부, user agent, JavaScript 설정 등 브라우저 동작을 정함[^s6]
- CrawlerRunConfig : 캐시, 추출 전략, 타임아웃, hook 등 한 번의 크롤 실행 방식을 정함[^s6]
- CrawlResult : `markdown` (raw·fit 두 버전), `extracted_content` 등 결과를 담음[^s6]
- Markdown 두 단계 : `raw_markdown` 은 HTML을 그대로 변환한 것, `fit_markdown` 은 콘텐츠 필터를 거친 것[^s6]
- 콘텐츠 필터 : `PruningContentFilterLXML`, `BM25ContentFilter` (질의 기준), `LLMContentFilter`. 사용자 정의 Markdown generator도 끼울 수 있음[^s1]
- 브라우저 엔진 : Chromium, Firefox, WebKit 지원. CDP(Chrome DevTools Protocol)로 원격 브라우저에 붙을 수 있음[^s1]
- 주요 의존성 : `playwright`, `patchright`, `playwright-stealth`, `lxml`, `beautifulsoup4`, `httpx`, `pydantic`, 그리고 포크 패키지 `unclecode-litellm==1.81.13`[^s3]
- 선택 설치(extras) : `pdf` (pypdf), `torch`, `transformer`, `cosine`, `sync` (selenium), `all`[^s3]

Docker 서버는 같은 라이브러리를 REST API와 MCP로 감싼 형태입니다.

- 기본 포트는 `11235`. `/health` 를 뺀 모든 endpoint가 `Authorization: Bearer $CRAWL4AI_API_TOKEN` 을 요구함[^s9]
- REST endpoint : `/crawl`, `/crawl/stream`, `/crawl/job`, `/html`, `/screenshot`, `/pdf`, `/execute_js`, `/md`, `/job/{task_id}`, `/health`, `/playground`, `/dashboard`[^s9]
- MCP : SSE(`/mcp/sse`)와 WebSocket(`/mcp/ws`) endpoint 제공. 도구는 `md`, `html`, `screenshot`, `pdf`, `execute_js`, `crawl`, `ask`[^s9]
- 설정 파일 : 컨테이너 안 `/app/config.yml` (빌드 시 `deploy/docker/config.yml` 에서 복사). `app`, `llm`, `api`, `crawler` 섹션이 있고 환경 변수가 파일 값을 덮어씀[^s9]
- 모니터링 : `/monitor/health`, `/monitor/browsers`, `/monitor/timeline` 등 조회 API와 `WS /monitor/ws` (2초 단위 갱신)[^s9]
- 요청 신뢰 경계 : 네트워크로 들어온 설정 객체는 `{"type": "ClassName", "params": {...}}` 형식으로 엄격히 검증하고, dict는 `{"type": "dict", "value": {...}}` 로 감싸야 함[^s9]

## 03. 주요 기능

- 구조화 추출 (LLM 없이) : `JsonCssExtractionStrategy`, `JsonXPathExtractionStrategy`, `RegexExtractionStrategy`[^s1]
- 스키마 생성 : 원하는 내용을 한 번 설명하면 `generate_schema` 가 재사용 가능한 스키마를 만들어 줌[^s1]
- LLM 추출 : `LLMExtractionStrategy` 로 LiteLLM이 지원하는 제공자를 써서 타입이 있는 JSON 스키마로 추출함. topic·regex·sentence chunking과 `CosineStrategy` 도 제공함[^s1]
- Deep crawl : `BFSDeepCrawlStrategy`, `DFSDeepCrawlStrategy`, `BestFirstCrawlingStrategy`. 공통 파라미터는 `max_depth`, `include_external`, `max_pages`, `filter_chain`, `url_scorer`[^s7]
    - 필터 : `URLPatternFilter`, `DomainFilter`, `ContentTypeFilter`, `ContentRelevanceFilter`, `SEOFilter` 를 `FilterChain` 으로 묶음
    - 점수 : `KeywordRelevanceScorer` 가 키워드와 가중치로 URL 우선순위를 정함
    - 장시간 크롤 : `resume_state` 와 `on_state_change` 콜백으로 중단 지점부터 다시 시작하고, `should_cancel` 또는 `cancel()` 로 멈춤
- Adaptive crawling : `AdaptiveCrawler` 가 질의에 답할 만큼 정보를 모았다고 판단하면 크롤을 멈춤[^s8]
    - 판단 지표 : Coverage(질의어를 얼마나 다루는지), Consistency(페이지 간 정보가 일관적인지), Saturation(새 페이지의 정보 증가가 줄어드는지)
    - 전략 : `statistical` (기본값, API 호출·모델 로딩 없음), `embedding` (의미 임베딩, 질의 변형 생성)
    - 기본값 : `confidence_threshold` 0.7, `max_pages` 20, `top_k_links` 3, `min_gain_threshold` 0.1
- URL 탐색 : `AsyncUrlSeeder` (sitemap, Common Crawl)와 `DomainMapper`. README는 `prefetch=True` 가 URL을 5~10배 빨리 찾는다고 적음[^s1]
- 동적 페이지 : JavaScript 실행, 요소 대기, `scan_full_page` 로 무한 스크롤·lazy 이미지 처리[^s1]
- 브라우저 제어 : 로그인 정보가 저장된 persistent profile, 세션 유지, 인증·로테이션 proxy, `enable_stealth` 와 undetected-browser 어댑터[^s1]
- 그 밖의 출력 : 스크린샷·PDF, 이미지·오디오·비디오·`srcset`·링크·iframe·메타데이터, `raw:` 와 `file://` 입력, 캐시, 단계별 hook[^s1]
- 대량 처리 : `arun_many` 와 메모리 적응형 dispatcher[^s1]
- Cloud 추가 기능 : `/search`, `/answer` (실험 기능), 자체 LLM 키 없는 `/extract`, 봇 차단 자동 처리. 한 번에 50개 URL 스트리밍 또는 10,000개 백그라운드 작업[^s1]

## 04. 시작하기

pip로 설치한 뒤 브라우저를 한 번 설치하면 됩니다.[^s5]
(`crawl4ai-setup` 을 빼먹는 것이 가장 흔한 실패 원인이라고 외부 가이드가 짚습니다.[^s13])

```bash
# 핵심 라이브러리 설치
pip install -U crawl4ai
# 브라우저 설치와 OS 수준 점검 (한 번만)
crawl4ai-setup
# 설치 상태 진단
crawl4ai-doctor
# 브라우저 설치가 실패하면 직접 설치
python -m playwright install --with-deps chromium
```

최소 예제는 URL 하나를 Markdown으로 받는 코드입니다.[^s1]

```python
import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    # 브라우저를 띄우고 블록이 끝나면 정리함
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url="https://news.ycombinator.com")
        # 페이지를 변환한 Markdown 출력
        print(result.markdown)

asyncio.run(main())
```

군더더기를 걷어 낸 `fit_markdown` 을 받으려면 콘텐츠 필터를 붙여야 합니다.[^s1]

```python
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.content_filter_strategy import PruningContentFilterLXML
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

async def main():
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,  # 캐시를 쓰지 않고 새로 가져옴
        markdown_generator=DefaultMarkdownGenerator(
            # 점수가 낮은 노드를 잘라 내는 필터
            content_filter=PruningContentFilterLXML(threshold=0.48, threshold_type="fixed", min_word_threshold=0)
        ),
    )
    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        result = await crawler.arun(url="https://en.wikipedia.org/wiki/Web_crawler", config=run_config)
        print(len(result.markdown.raw_markdown))  # 필터 전 길이
        print(len(result.markdown.fit_markdown))  # 필터 후 길이

asyncio.run(main())
```

Docker 서버는 토큰을 먼저 만들어 넘겨야 외부에서 접근할 수 있습니다.[^s1]
(토큰이 없으면 컨테이너 안 loopback에만 바인딩되어, 컨테이너가 healthy로 보여도 공개 포트는 연결이 끊깁니다.[^s9])

```bash
# API 토큰 생성
export CRAWL4AI_API_TOKEN="$(openssl rand -hex 32)"
# 서버 실행
docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g \
  -e CRAWL4AI_API_TOKEN="$CRAWL4AI_API_TOKEN" \
  unclecode/crawl4ai:latest
# 약 10초 뒤 Markdown 요청으로 확인
curl -s http://localhost:11235/md \
  -H "Authorization: Bearer $CRAWL4AI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com"}' | jq -r .markdown
```

CLI `crwl` 로도 같은 작업을 할 수 있습니다.[^s1]

```bash
# 페이지 하나를 Markdown으로
crwl https://news.ycombinator.com -o markdown
# BFS로 최대 10페이지 deep crawl
crwl https://docs.crawl4ai.com --deep-crawl bfs --max-pages 10
# 페이지에 질문하기 (LLM 키 필요: crwl config)
crwl https://www.example.com/products -q "Extract all product prices"
```

자체 서버를 Claude Code에 MCP로 붙이는 명령은 다음과 같습니다.[^s9]

```bash
claude mcp add --transport sse c4ai-sse http://localhost:11235/mcp/sse
```

## 05. 최근 변화

README가 안내하는 최신 버전은 v0.9.4 (2026-09-23)입니다.[^s1]
최근 릴리스는 Docker 서버 보안 강화에 집중되어 있고, 두 번 연속 보안 릴리스가 나왔습니다.

- 0.9.4 (2026-09-23) : 보안 릴리스, 호환성을 깨는 변경 없음[^s10]
    - robots.txt 조회를 통한 blind SSRF (GHSA-f77g-77vp-r96v), `link_preview_config` 를 통한 응답 노출 SSRF (GHSA-wh5w-hmj3-vgg7) 수정. 새 `crawl4ai/egress_policy.py` 로 라이브러리 자체 HTTP 클라이언트도 서버의 egress proxy를 거침
    - `{"type": "dict", ...}` 로 감싸 `LLMConfig` 같은 금지 타입을 통과시켜 서버 환경 변수를 읽던 문제 수정 (GHSA-5w5p-vcv6-mm3f)
    - `PruningContentFilterLXML` 추가 및 기본값화. 출력은 기존 필터와 바이트 단위로 같고, 측정값은 중간 크기 페이지 134→13 ms, 6000개 카드 페이지 2200→260 ms
    - `PruningContentFilter` 직접 사용 시 `DeprecationWarning`
    - `CRAWL4AI_MAX_TIMEOUT_MS` (기본 60000 ms), 브라우저 context 재활용 `crawler.pool.max_pages_before_recycle` (기본 200) 추가
    - 표의 `rowspan`·`colspan` 처리, BFS·BestFirst deep crawl 중복 처리, robots.txt `Disallow: /*?` 처리 수정
- 0.9.3 (2026-08-31) : 보안 릴리스, 새 기능과 호환성을 깨는 변경 없음[^s10]
    - PDF 경로의 임의 파일 쓰기, redirect SSRF, 크기·페이지 무제한 DoS, `cleaned_html` XSS와 Playground의 DOM XSS(API 토큰 탈취) 등 권고 5건 수정
    - PDF 다운로드 상한 `max_pdf_bytes` 100 MiB, `max_pdf_pages` 2000, `limits.wall_clock_s` 300초
    - `develop` 브랜치에 쌓인 버그 수정 33건 포함. `mcp` 패키지를 2 미만으로 고정
- 0.9.0 (2026-06-18) : Docker API 서버를 secure-by-default로 바꾼 대규모 릴리스. pip 라이브러리는 변경 없음[^s10]
    - 인증 기본 활성화, 토큰 없으면 `127.0.0.1` 바인딩, JWT 변경으로 기존 토큰 재발급 필요
    - `js_code`, `proxy_config`, `cdp_url`, `cookies`, `headers`, `deep_crawl_strategy`, `magic` 등을 네트워크 요청으로 보내면 HTTP 400
    - Python hook 코드 대신 선언형 hook(`block_resources`, `add_cookies`, `set_headers`, `scroll_to_bottom`, `wait_for_timeout`)
    - `output_path` 대신 `artifact_id`, CORS 기본 거부, TLS 검증 기본 활성화, Redis 비밀번호 필수
    - 이전 방식에서 옮기는 절차는 `deploy/docker/MIGRATION.md` 에 있음
- v0.9.2 (7월 15일), v0.9.1 (7월 8일) 릴리스 본문은 "See CHANGELOG.md for details"만 적혀 있음[^s11]

## 06. 커뮤니티에서 반복되는 주제

조회 시점 열린 이슈 목록은 Docker 서버와 PDF 처리에 몰려 있습니다.
목록에 보인 일부 이슈는 CHANGELOG상 0.9.3에서 수정 항목으로 올라가 있어, 조회한 목록이 최신 상태가 아닐 수 있습니다.

- PDF 처리 : `PDFCrawlerStrategy` 가 "Blocked by anti-bot protection"으로 실패(#2135), Docker 이미지에 pypdf가 없어 `PDFContentScrapingStrategy` 가 실패(#2127)[^s12]
    - #2135는 0.9.3에서 PDF placeholder 응답을 anti-bot 차단으로 오판하지 않도록 수정되었다고 함[^s10]
- Docker 서버 오류 응답 : `wait_for` selector가 끝내 맞지 않으면 `/crawl` 이 HTTP 500(#2133), anti-bot 감지 실패 시 `/md`·`/llm/{url}` 이 HTTP 500(#2116)[^s12]
- 대기 시간 : 숨겨진 `<body>` 때문에 매 크롤에 30초가 고정으로 더해진다는 보고(#2129). 0.9.3에서 body-visibility timeout을 설정·검증할 수 있게 바뀜[^s12][^s10]
- 설정 무시 : `preserve_tags` / `preserve_classes` 가 제외 태그에는 효과가 없음(#2125), `crawler.base_config` 의 boolean 값이 조용히 무시됨(#2121)[^s12]
- 컨테이너 환경 : cgroup v2에서 메모리 가드가 호스트 RAM을 읽음(#2123), arm64 이미지에 QEMU 에뮬레이션 빌드 잔여물 약 2.4GB가 남음(#2092)[^s12]
- MCP 연결 : LM Studio에서 MCP로 붙을 때 타임아웃(#2120)[^s12]
- 의존성 : `unclecode-litellm` 이 upstream 패키지를 가린다는 이슈(#2098). `pyproject.toml` 은 `unclecode-litellm==1.81.13` 에 고정되어 있음[^s12][^s3]
- 콘텐츠 필터 : `PruningContentFilter` 가 코드 블록의 공백만 있는 span을 버림(#2110)[^s12]

## 07. 실제 개발에서 어떻게 쓰는가

2026-07-08에 갱신된 외부 가이드가 v0.9.1 기준으로 RAG 파이프라인 구성을 다룹니다.
글 작성 시점 이후 기본 필터가 `PruningContentFilterLXML` 로 바뀌었으므로 예제 이름은 지금과 다를 수 있습니다.

- RAG 흐름 : `fit_markdown` 으로 크롤 → LangChain `MarkdownHeaderTextSplitter` 로 제목 단위 분할 → FAISS 등 벡터 DB에 임베딩 저장[^s13]
- 제목 단위로 나누면 한 섹션이 제목과 함께 남아 문맥이 끊기지 않는다고 설명함[^s13]
- `fit_markdown` 은 콘텐츠 필터를 붙이기 전까지 비어 있음. 가이드에서는 pruning 필터로 일반 페이지 크기가 약 62% 줄었다고 함[^s13]
- 추출 경로 선택 : CSS/JSON 추출은 비용이 없고 결과가 결정적이며, LLM 추출은 유연하지만 비용이 달라짐[^s13]
- 에이전트 연동 : 서버 배포에 포함된 MCP로 에이전트가 추론 중에 크롤러를 도구로 호출함[^s13]
- Cloud는 Claude Code에 HTTP MCP로 한 줄 등록함. `claude mcp add --transport http crawl4ai https://api.crawl4ai.com/mcp --header "Authorization: Bearer $CRAWL4AI_KEY"`[^s1]

## 08. 한계와 주의점

- 봇 차단 : stealth와 proxy hook은 있지만 proxy와 차단 우회는 사용자가 마련해야 함. Cloudflare 상위 등급이나 DataDome 앞에서는 stealth 모드와 데이터센터 proxy로 부족하다고 외부 가이드가 평가함[^s13]
- 인증이 필요한 SOCKS5 proxy는 지원하지 않는다고 함 (v0.9.1 기준 외부 가이드)[^s13]
- 캐시 기본값은 `CacheMode.BYPASS` 라 매번 새로 가져옴. 캐시를 쓰려면 `CacheMode.ENABLED` 를 지정해야 함[^s6]
- Deep crawl에서 `max_depth` 를 3보다 크게 잡으면 페이지 수가 기하급수로 늘어남. 결과마다 `result.status` 를 확인해야 함[^s7]
- Adaptive crawling은 사이트 전체 보관, 패턴이 정해진 구조화 추출, 실시간 모니터링에는 권하지 않음[^s8]
- 선택 설치 `[torch]`, `[transformer]`, `[all]` 은 디스크와 메모리 사용량을 크게 늘림[^s5]
- Docker 서버 요구 사항 : Docker 20.10.0+, `docker compose` v2.24+, RAM 4GB 이상[^s9]
- Docker 서버는 0.9.0부터 브라우저 내부 설정·코드성 필드를 네트워크로 받지 않음. 이런 설정은 서버 쪽에서 하거나 in-process SDK를 써야 함[^s10]
- TLS 검증이 기본으로 켜져 있어 자체 서명 인증서 대상은 실패함. 내부 테스트용 우회 변수는 `CRAWL4AI_ALLOW_INSECURE_TLS=true`, `CRAWL4AI_ALLOW_INTERNAL_URLS=true`[^s10]
- Hook은 기본 비활성이며 `CRAWL4AI_HOOKS_ENABLED=true` 로 켜고, 요청당 최대 10개까지 씀[^s9]
- Apache 2.0이지만 README는 배지나 문구로 출처를 표시하라고 요구함. 두 조건의 관계는 LICENSE 원문으로 확인해야 함[^s1]

## 09. 더 알아볼 것

- v0.9.1, v0.9.2의 변경 내역은 릴리스 본문이 CHANGELOG로 넘기지만, CHANGELOG에는 0.9.0 다음이 0.9.3이라 두 버전 항목을 찾지 못했습니다.
- 저장소 페이지 기준 열린 이슈는 33건인데 이슈 목록은 32건으로 표시되었고, 목록 내용도 8월 이전 상태로 보여 최신 이슈를 다시 확인해야 합니다.
- Self-hosting 문서의 LLM 우선순위 설명에는 요청 단위 `base_url` 이 남아 있는데, 0.9.0 CHANGELOG는 LLM `base_url` 을 제거했다고 적어 두 문서가 어긋납니다.
- Cloud의 실제 요금표(live prices)와 `/answer` 의 동작 방식은 확인하지 못했습니다.
- `unclecode-litellm` 포크를 쓰는 이유와 upstream LiteLLM과의 차이는 확인하지 못했습니다.
- Adaptive crawling `embedding` 전략이 쓰는 임베딩 모델과 필요한 extras는 확인하지 못했습니다.
- 리포트 기준(2026-09-26) Star는 84,265개이고 new_repository(첫 수집)라 24시간 증가량은 없습니다. 조사 시점(2026-09-29) API 값은 84,408개로 리포트 대비 143개 많습니다.

## 참고 자료

- [Crawl4AI README (main)](https://github.com/unclecode/crawl4ai/blob/main/README.md) (readme)
- [unclecode/crawl4ai 저장소 페이지](https://github.com/unclecode/crawl4ai) (code)
- [pyproject.toml (main)](https://github.com/unclecode/crawl4ai/blob/main/pyproject.toml) (code)
- [Crawl4AI Documentation 홈](https://docs.crawl4ai.com/) (docs)
- [Installation](https://docs.crawl4ai.com/core/installation/) (docs)
- [Quick Start](https://docs.crawl4ai.com/core/quickstart/) (docs)
- [Deep Crawling](https://docs.crawl4ai.com/core/deep-crawling/) (docs)
- [Adaptive Crawling](https://docs.crawl4ai.com/core/adaptive-crawling/) (docs)
- [Self-Hosting Guide](https://docs.crawl4ai.com/core/self-hosting/) (docs)
- [CHANGELOG.md (0.9.4, 0.9.3, 0.9.0)](https://github.com/unclecode/crawl4ai/blob/main/CHANGELOG.md) (release)
- [Releases 목록](https://github.com/unclecode/crawl4ai/releases) (release)
- [열린 Issues 목록](https://github.com/unclecode/crawl4ai/issues) (issues)
- [The complete Crawl4AI guide for LLM-ready data and AI web crawling (ScrapingBee)](https://www.scrapingbee.com/blog/crawl4ai/) (blog)

[^s1]: [Crawl4AI README (main)](https://github.com/unclecode/crawl4ai/blob/main/README.md)
[^s2]: [unclecode/crawl4ai 저장소 페이지](https://github.com/unclecode/crawl4ai)
[^s3]: [pyproject.toml (main)](https://github.com/unclecode/crawl4ai/blob/main/pyproject.toml)
[^s4]: [Crawl4AI Documentation 홈](https://docs.crawl4ai.com/)
[^s5]: [Installation](https://docs.crawl4ai.com/core/installation/)
[^s6]: [Quick Start](https://docs.crawl4ai.com/core/quickstart/)
[^s7]: [Deep Crawling](https://docs.crawl4ai.com/core/deep-crawling/)
[^s8]: [Adaptive Crawling](https://docs.crawl4ai.com/core/adaptive-crawling/)
[^s9]: [Self-Hosting Guide](https://docs.crawl4ai.com/core/self-hosting/)
[^s10]: [CHANGELOG.md (0.9.4, 0.9.3, 0.9.0)](https://github.com/unclecode/crawl4ai/blob/main/CHANGELOG.md)
[^s11]: [Releases 목록](https://github.com/unclecode/crawl4ai/releases)
[^s12]: [열린 Issues 목록](https://github.com/unclecode/crawl4ai/issues)
[^s13]: [The complete Crawl4AI guide for LLM-ready data and AI web crawling (ScrapingBee)](https://www.scrapingbee.com/blog/crawl4ai/)
