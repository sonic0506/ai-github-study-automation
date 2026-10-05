# Crawl4AI 설치와 첫 사용

> pip 설치와 브라우저 준비, 기본 설정, URL 하나를 Markdown으로 받는 첫 예제, CLI와 Docker 서버로 같은 일을 하는 방법, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

필요 조건은 Python 3.10 이상입니다(2026년 10월 기준 패키지 분류자는 3.10~3.13). 라이브러리는 브라우저 자동화에 Playwright를 쓰므로, 패키지 설치와 별개로 **브라우저를 한 번 설치하는 단계**가 있습니다.

```bash
# 가상 환경 권장
python -m venv .venv && source .venv/bin/activate

pip install -U crawl4ai
crawl4ai-setup      # 브라우저 설치와 OS 수준 점검 (한 번만)
crawl4ai-doctor     # 설치 상태 진단
```

uv를 쓰는 프로젝트라면 다음과 같습니다.

```bash
uv add crawl4ai
uv run crawl4ai-setup
```

`crawl4ai-setup`이 실패하면 Playwright 명령으로 Chromium을 직접 설치합니다.

```bash
python -m playwright install --with-deps chromium
```

**선택 설치(extras)** 는 필요한 기능이 있을 때만 붙입니다.

| extra | 추가되는 것 | 필요한 경우 |
|---|---|---|
| `crawl4ai[pdf]` | pypdf | PDF를 크롤링해 텍스트를 뽑을 때 |
| `crawl4ai[torch]` | torch, nltk, scikit-learn | 로컬 임베딩·클러스터링 기반 기능 |
| `crawl4ai[transformer]` | transformers, sentence-transformers | 로컬 트랜스포머 모델 사용 |
| `crawl4ai[cosine]` | torch + transformers | `CosineStrategy` |
| `crawl4ai[all]` | 위 전부 + selenium | 기여·실험용 |

`torch`, `transformer`, `all`은 수 GB 단위로 디스크와 메모리를 늘립니다. Markdown 변환과 CSS·LLM 추출만 쓴다면 기본 설치로 충분합니다.

---

## 기본 설정

라이브러리 자체는 설정 파일 없이 동작합니다. 알아 둘 환경 설정은 두 가지입니다.

```bash
# 캐시 DB 위치 (기본: ~/.crawl4ai/crawl4ai.db)
export CRAWL4_AI_BASE_DIRECTORY=/data/crawl4ai

# LLM 추출·LLM 필터를 쓸 때만 필요 (LiteLLM이 지원하는 제공자 키)
export OPENAI_API_KEY=sk-...
```

LLM 키는 코드에서 `LLMConfig(provider="openai/gpt-4o-mini", api_token=os.getenv("OPENAI_API_KEY"))`처럼 명시적으로 넘기는 편이 어떤 키가 쓰이는지 분명합니다. 로컬 모델이라면 `provider="ollama/llama3.3"`처럼 제공자 이름만 바꿉니다.

---

## 가장 간단한 예제

```python
# first_crawl.py
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.content_filter_strategy import PruningContentFilterLXML
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

async def main():
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.ENABLED,  # 개발 중에는 같은 페이지를 다시 받지 않도록
        markdown_generator=DefaultMarkdownGenerator(
            content_filter=PruningContentFilterLXML(threshold=0.48, threshold_type="fixed")
        ),
    )
    async with AsyncWebCrawler(config=BrowserConfig(headless=True)) as crawler:
        result = await crawler.arun("https://en.wikipedia.org/wiki/Web_crawler", config=run_cfg)

        if not result.success:
            raise SystemExit(f"실패: {result.status_code} {result.error_message}")

        print("raw:", len(result.markdown.raw_markdown), "chars")
        print("fit:", len(result.markdown.fit_markdown), "chars")
        print(result.markdown.fit_markdown[:500])

asyncio.run(main())
```

```bash
python first_crawl.py
```

1. **무엇을 생성하는가**: `AsyncWebCrawler`가 headless Chromium을 띄우고, 블록이 끝날 때 닫습니다. 같은 블록 안의 다른 `arun()` 호출은 이 브라우저를 재사용합니다.
2. **어떤 값을 전달하는가**: 크롤할 URL과 `CrawlerRunConfig`입니다. 여기서는 캐시를 켜고, Markdown 생성기에 점수 기반 본문 필터 `PruningContentFilterLXML`을 붙였습니다.
3. **Crawl4AI가 무엇을 처리하는가**: 페이지를 렌더링하고, HTML을 정제하고, 전체 Markdown(`raw_markdown`)과 본문만 남긴 Markdown(`fit_markdown`)을 함께 만듭니다. 위키백과 문서라면 사이드바·언어 목록·편집 링크가 빠지면서 `fit` 쪽 길이가 눈에 띄게 줄어듭니다.
4. **어떤 결과를 반환하는가**: `CrawlResult`를 돌려줍니다. 실패해도 예외 대신 `success=False`와 `error_message`가 담긴 결과가 오므로, 첫 줄에서 성공 여부를 확인합니다.

필터를 빼고 `result.markdown`만 출력하면 README에 있는 가장 짧은 예제와 같습니다. 그 경우 `fit_markdown`은 빈 문자열입니다.

---

## CLI로 같은 일 하기

`crwl` 명령은 스크립트를 쓰기 전에 페이지가 어떻게 변환되는지 빠르게 확인할 때 편합니다.

```bash
# 페이지 하나를 Markdown으로
crwl https://news.ycombinator.com -o markdown

# BFS로 최대 10페이지 deep crawl
crwl https://docs.crawl4ai.com --deep-crawl bfs --max-pages 10

# 페이지에 질문하기 (LLM 키 필요, 먼저 crwl config로 설정)
crwl https://www.example.com/products -q "Extract all product prices"
```

---

## Docker 서버로 같은 일 하기

Python 밖에서 쓰거나 여러 서비스가 공유하려면 Docker 서버를 띄웁니다. v0.9.0부터 **토큰이 없으면 서버가 컨테이너 내부 loopback에만 바인딩**하므로, 반드시 토큰을 만들어 넘겨야 합니다.

```bash
export CRAWL4AI_API_TOKEN="$(openssl rand -hex 32)"

docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g \
  -e CRAWL4AI_API_TOKEN="$CRAWL4AI_API_TOKEN" \
  unclecode/crawl4ai:0.9.4

# 약 10초 뒤
curl -s http://localhost:11235/md \
  -H "Authorization: Bearer $CRAWL4AI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com", "f": "fit"}' | jq -r .markdown
```

`/md`의 `f`는 필터 종류(`fit`, `raw`, `bm25`, `llm`)이고, `bm25`·`llm`일 때는 `q`에 질의를 넣습니다. 대시보드는 `http://localhost:11235/dashboard`, 요청을 시험해 보는 Playground는 `/playground`에 있습니다. 서버 운영은 [활용 예시 ③ 자체 서버·에이전트·운영](05-usage-self-hosted-server.md)에서 다룹니다.

---

## 설치할 때 주의할 점

- **`crawl4ai-setup`을 빼먹는 것이 가장 흔한 실패 원인입니다.** pip 설치만으로는 브라우저 바이너리가 없어 첫 `arun()`에서 실패합니다. CI나 Docker 이미지를 직접 만들 때도 이 단계를 넣어야 합니다.
- **Linux 서버에서는 브라우저 시스템 라이브러리가 필요합니다.** `--with-deps` 옵션이 이를 설치하며, root 권한이 필요할 수 있습니다. 최소 이미지에서 직접 맞추기 어렵다면 공식 Docker 이미지를 쓰는 편이 쉽습니다.
- **Docker 실행 시 `--shm-size`를 주어야 합니다.** Chromium은 공유 메모리(`/dev/shm`)를 많이 쓰는데, Docker 기본값(64MB)으로는 탭이 무작위로 죽을 수 있습니다. 공식 안내는 `--shm-size=1g`입니다.
- **`-e CRAWL4AI_API_TOKEN`처럼 값 없이 넘기지 않습니다.** 셸에 변수가 없으면 빈 값이 조용히 전달되어 서버가 loopback에만 바인딩됩니다. 이때 컨테이너는 healthy로 보이지만 바깥에서 접속하면 연결이 끊깁니다.
- **기존 서버 토큰은 v0.9.0 이후 재발급해야 합니다.** JWT 구현이 바뀌어 예전 토큰이 무효입니다.
- **의존성 고정에 주의합니다.** `crawl4ai`는 LiteLLM의 포크 패키지인 `unclecode-litellm`을 특정 버전(`==1.81.13`, 2026년 10월 기준)으로 고정합니다. 같은 환경에서 upstream `litellm`을 따로 쓰는 프로젝트라면 충돌 여부를 먼저 확인하고, 가능하면 크롤러를 별도 가상 환경이나 서비스로 분리합니다.
- **버전을 고정합니다.** 0.x 단계라 마이너 버전 사이에도 기본값과 서버 동작이 바뀝니다. `crawl4ai==0.9.4`, `unclecode/crawl4ai:0.9.4`처럼 고정하고 릴리스 노트를 확인한 뒤 올립니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 문서 사이트를 RAG 데이터로 수집하기 →](03-usage-rag-ingestion.md)
