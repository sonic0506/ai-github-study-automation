# Crawl4AI 활용 예시 ② 구조화 데이터 추출

> 웹 페이지에서 Markdown이 아니라 필드가 정해진 JSON을 뽑는 방법을 다룹니다. LLM 없이 CSS 스키마로 추출하기, LLM으로 스키마를 한 번만 만들어 재사용하기, 형식이 제각각인 페이지를 LLM으로 추출하기, 동적 페이지 처리 순서로 진행합니다.

Crawl4AI는 프론트엔드에서 실행되는 라이브러리가 아니므로, 여기서는 Client/Server 구분 대신 **"데이터를 꺼내는 쪽"의 관점**으로 봅니다. 같은 페이지라도 "LLM에게 읽힐 텍스트"가 필요한지, "DB에 넣을 필드"가 필요한지에 따라 쓰는 기능이 달라집니다.

## 활용할 수 있는 기능

| 기능 | 입력 | LLM 호출 | 결과가 매번 같은가 | 어울리는 페이지 |
|---|---|---|---|---|
| `JsonCssExtractionStrategy` | HTML + CSS 선택자 스키마 | 없음 | 같음 | 상품 목록, 게시판, 검색 결과처럼 반복 구조 |
| `JsonXPathExtractionStrategy` | HTML + XPath 스키마 | 없음 | 같음 | CSS로 표현하기 어려운 위치(텍스트 기준 탐색 등) |
| `RegexExtractionStrategy` | 텍스트 + 정규식 | 없음 | 같음 | 이메일, 전화번호, 날짜, 금액 같은 패턴 |
| `generate_schema` / `agenerate_schema` | 예시 HTML 또는 URL + 자연어 설명 | 스키마 만들 때만 | 스키마 고정 후 같음 | 사이트는 많은데 선택자를 손으로 쓰기 싫을 때 |
| `LLMExtractionStrategy` | Markdown·HTML + Pydantic 스키마 | 페이지마다 | 다를 수 있음 | 공고문, 보도자료, 이벤트 안내처럼 형식이 제각각 |
| `CosineStrategy` | 텍스트 + 질의 | 없음(로컬 임베딩) | 같음 | 질의와 비슷한 문단 묶음 찾기 |

선택 순서는 단순합니다. **반복 구조면 CSS 스키마, 선택자를 쓰기 귀찮으면 스키마 생성 후 CSS, 구조가 없으면 그때 LLM**입니다.

---

## 예제 1. LLM 없이 상품 목록 추출하기

스크래핑 연습용으로 공개된 `books.toscrape.com`의 목록 페이지 5장에서 도서 정보를 뽑습니다.

```python
# extract_books.py
import asyncio
import json
from urllib.parse import urljoin

from crawl4ai import (
    AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode,
    JsonCssExtractionStrategy, MemoryAdaptiveDispatcher, RateLimiter,
)

BOOK_SCHEMA = {
    "name": "books",
    "baseSelector": "article.product_pod",          # 도서 카드 하나 = 결과 한 건
    "fields": [
        {"name": "title", "selector": "h3 a", "type": "attribute", "attribute": "title"},
        {"name": "href", "selector": "h3 a", "type": "attribute", "attribute": "href"},
        {"name": "price", "selector": "p.price_color", "type": "regex", "pattern": r"([\d.]+)"},
        {"name": "availability", "selector": "p.instock.availability", "type": "text"},
        {"name": "rating", "selector": "p.star-rating", "type": "attribute", "attribute": "class"},
    ],
}

async def main() -> None:
    urls = [f"https://books.toscrape.com/catalogue/page-{n}.html" for n in range(1, 6)]
    run_cfg = CrawlerRunConfig(
        extraction_strategy=JsonCssExtractionStrategy(BOOK_SCHEMA),
        cache_mode=CacheMode.BYPASS,                 # 가격은 항상 최신으로
    )
    dispatcher = MemoryAdaptiveDispatcher(
        memory_threshold_percent=80.0,               # 메모리 80% 넘으면 새 작업 대기
        max_session_permit=4,                        # 동시에 여는 페이지 수 상한
        rate_limiter=RateLimiter(base_delay=(1.0, 2.0), max_delay=30.0, max_retries=2),
    )

    books = []
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, text_mode=True)) as crawler:
        results = await crawler.arun_many(urls, config=run_cfg, dispatcher=dispatcher)
        for result in results:
            if not result.success:
                print(f"[fail] {result.url}: {result.error_message}")
                continue
            for item in json.loads(result.extracted_content):
                item["url"] = urljoin(result.url, item.pop("href", ""))
                item["price"] = float(item["price"]) if item.get("price") else None
                item["rating"] = item.get("rating", "").replace("star-rating", "").strip()
                books.append(item)

    print(f"{len(books)} books")
    print(json.dumps(books[0], indent=2, ensure_ascii=False))

asyncio.run(main())
```

### 동작 설명

1. **`baseSelector`가 "한 건"의 단위입니다.** 페이지 안에서 `article.product_pod`에 맞는 요소마다 결과 객체 하나가 만들어지고, `fields`의 선택자는 그 요소 안에서만 찾습니다.
2. **`type`은 값을 꺼내는 방법입니다.** `text`는 텍스트, `attribute`는 지정한 속성, `html`은 내부 HTML, `regex`는 텍스트에 정규식을 적용해 첫 번째 그룹을 꺼냅니다. `["text", "regex"]`처럼 리스트로 단계를 이어 붙일 수도 있고, 반복되는 하위 요소는 `list`, `nested`, `nested_list` 타입으로 표현합니다.
3. **`JsonCssExtractionStrategy`는 HTML을 입력으로 씁니다.** Markdown 변환과 무관하게 렌더링된 HTML에서 바로 추출하므로, 본문 필터 설정이 추출 결과에 영향을 주지 않습니다.
4. **`arun_many`와 dispatcher로 여러 페이지를 처리합니다.** `max_session_permit`이 동시 페이지 수를, `RateLimiter`가 같은 도메인 요청 사이의 무작위 지연과 429·503 응답 시 지수 백오프를 맡습니다.
5. **후처리는 애플리케이션 몫입니다.** 상대 경로를 절대 URL로 바꾸고, 문자열 가격을 숫자로 바꾸는 일은 스키마 밖에서 합니다.

> 선택자에 맞는 요소가 없으면 그 필드는 결과에서 **빠지고 오류가 나지 않습니다**(`default`를 지정했다면 그 값). 사이트 구조가 바뀌어도 조용히 빈 필드가 쌓일 수 있으므로, 운영에서는 필수 필드 누락 비율을 따로 감시해야 합니다.

---

## 예제 2. 스키마는 LLM으로 한 번만 만들고 계속 재사용하기

수집할 사이트가 수십 개라면 선택자를 손으로 쓰는 것도 일입니다. `agenerate_schema`는 예시 페이지와 자연어 설명을 LLM에 보내 위와 같은 스키마를 만들어 줍니다. **LLM 비용은 스키마를 만들 때 한 번만** 들고, 이후 크롤링은 예제 1과 똑같이 LLM 없이 돌아갑니다.

```python
# make_schema.py
import asyncio
import json
import os
from pathlib import Path

from crawl4ai import JsonCssExtractionStrategy, LLMConfig

async def main() -> None:
    schema = await JsonCssExtractionStrategy.agenerate_schema(
        url="https://books.toscrape.com/",
        query="각 도서 카드에서 제목, 가격(숫자만), 재고 문구, 상세 페이지 링크를 추출",
        llm_config=LLMConfig(provider="openai/gpt-4o-mini", api_token=os.getenv("OPENAI_API_KEY")),
    )
    Path("schemas").mkdir(exist_ok=True)
    Path("schemas/books.json").write_text(json.dumps(schema, indent=2, ensure_ascii=False))
    print(json.dumps(schema, indent=2, ensure_ascii=False))

asyncio.run(main())
```

생성된 `schemas/books.json`은 사람이 열어 검토하고 저장소에 커밋합니다. 크롤러는 이 파일을 읽어 `JsonCssExtractionStrategy(json.load(...))`로 씁니다. 사이트 구조가 바뀌어 필수 필드가 비기 시작하면 그때 스키마를 다시 생성합니다. 코드 안에서 이미 이벤트 루프가 돌고 있다면 동기 버전 `generate_schema` 대신 지금처럼 `agenerate_schema`를 `await`합니다.

---

## 예제 3. 형식이 제각각인 페이지는 LLM으로 추출하기

행사 안내 페이지처럼 사이트마다 레이아웃이 다르고, "일시"가 표에 있기도 하고 본문 문장에 섞여 있기도 하다면 선택자가 통하지 않습니다. 이때 `LLMExtractionStrategy`에 Pydantic 스키마를 줍니다.

```python
# extract_event.py
import asyncio
import json
import os
from typing import Optional

from pydantic import BaseModel, Field
from crawl4ai import (
    AsyncWebCrawler, CrawlerRunConfig, CacheMode, LLMConfig, LLMExtractionStrategy,
)
from crawl4ai.content_filter_strategy import PruningContentFilterLXML
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

class Event(BaseModel):
    name: str = Field(..., description="행사 이름")
    starts_at: str = Field(..., description="시작 일시, ISO 8601 형식")
    location: Optional[str] = Field(None, description="장소 또는 온라인 여부")
    fee_krw: Optional[int] = Field(None, description="참가비(원). 무료면 0")

async def main(url: str) -> None:
    strategy = LLMExtractionStrategy(
        llm_config=LLMConfig(provider="openai/gpt-4o-mini", api_token=os.getenv("OPENAI_API_KEY")),
        schema=Event.model_json_schema(),
        extraction_type="schema",
        instruction="페이지에 안내된 행사 정보를 추출하라. 페이지에 없는 값은 null로 둔다.",
        input_format="fit_markdown",        # 본문만 보내 토큰을 줄인다
    )
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.ENABLED,
        markdown_generator=DefaultMarkdownGenerator(content_filter=PruningContentFilterLXML()),
        extraction_strategy=strategy,
    )
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url, config=run_cfg)
        events = [Event.model_validate(e) for e in json.loads(result.extracted_content or "[]")
                  if not e.get("error")]
        print(events)
        strategy.show_usage()               # 프롬프트·응답 토큰 사용량

asyncio.run(main("https://example.com/events/devfest-2026"))  # 실제 행사 페이지 URL로 교체
```

- **`input_format="fit_markdown"`** 으로 본문 필터를 거친 텍스트만 모델에 보냅니다. 필터를 설정하지 않았거나 `fit_markdown`이 비면 Crawl4AI가 자동으로 `markdown`(raw)으로 바꿔 보냅니다.
- **긴 페이지는 청크로 나뉘어 여러 번 호출될 수 있습니다.** 그래서 결과가 리스트로 오고, 청크마다 비슷한 항목이 중복될 수 있습니다. 결과를 Pydantic으로 다시 검증하고 중복을 정리하는 단계를 둡니다.
- **`show_usage()`로 비용을 확인합니다.** 페이지 수에 비례해 비용이 늘어나므로, 대량 수집 전에 몇 페이지로 토큰 사용량을 먼저 재 봅니다.
- **LLM 결과는 검증 대상입니다.** 날짜 형식이나 금액 단위를 모델이 틀릴 수 있으므로 저장 전에 검증합니다.

---

## 동적 페이지에서 먼저 확인할 것

추출 결과가 비어 있다면 스키마보다 **추출 시점에 데이터가 DOM에 있었는지**를 먼저 의심합니다.

```python
from crawl4ai import CrawlerRunConfig

# 무한 스크롤 목록: 끝까지 스크롤한 뒤 HTML을 가져온다
scroll_cfg = CrawlerRunConfig(scan_full_page=True, scroll_delay=0.5)

# 비동기로 그려지는 목록: 카드가 20개 이상 나타날 때까지 기다린다
wait_cfg = CrawlerRunConfig(wait_for="js:() => document.querySelectorAll('.card').length >= 20")

# "더보기" 버튼: 같은 탭(session)에서 JS만 실행해 이어서 읽는다
more_cfg = CrawlerRunConfig(
    session_id="list-session",
    js_code="document.querySelector('button.load-more')?.click();",
    js_only=True,                       # 페이지를 다시 열지 않고 현재 탭에서 실행
    wait_for="css:.card:nth-child(40)",
)
```

`session_id`를 쓰는 경우 첫 `arun()`에도 같은 `session_id`를 주고, 작업이 끝나면 `await crawler.crawler_strategy.kill_session("list-session")`으로 탭을 닫습니다. 이 기능들은 라이브러리에서만 쓸 수 있고, Docker 서버는 보안상 `js_code`와 `session_id`를 네트워크 요청으로 받지 않습니다.

---

## 실제 서비스에서는

> 중고 도서 가격 비교 서비스를 예로 들면, 매일 새벽 워커가 서점 사이트 5곳의 목록 페이지를 `arun_many`로 돌며 사이트별로 저장해 둔 CSS 스키마로 제목·가격·재고를 뽑아 DB에 넣습니다. 사용자가 상품 상세 화면을 열면 서버는 DB의 최신 가격을 보여 줄 뿐, 그 순간 크롤링하지 않습니다. 새 서점을 추가할 때만 개발자가 `agenerate_schema`로 스키마 초안을 만들고 검토해 커밋합니다. 레이아웃이 매번 다른 "할인 행사 공지"만 LLM 추출로 처리하고, 결과는 관리자 확인 후 노출합니다.

핵심은 **LLM을 "매 요청의 엔진"이 아니라 "스키마를 만드는 도구"와 "예외 처리기"로 쓰는 것**입니다. 그래야 비용이 페이지 수에 비례해 늘지 않고, 같은 입력에 같은 결과가 나와 테스트와 장애 분석이 쉬워집니다. 이 흐름을 팀 단위 서비스로 운영하는 구조는 [활용 예시 ③ 자체 서버·에이전트·운영](05-usage-self-hosted-server.md)에서 이어집니다.

---

[← 활용 예시 ① 문서 사이트를 RAG 데이터로 수집하기](03-usage-rag-ingestion.md) · [목차](README.md) · [활용 예시 ③ 자체 서버·에이전트·운영 →](05-usage-self-hosted-server.md)
