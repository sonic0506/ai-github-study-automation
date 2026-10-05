# Crawl4AI 활용 예시 ① 문서 사이트를 RAG 데이터로 수집하기

> 공식 문서 사이트를 deep crawl해서 본문만 남긴 Markdown을 만들고, 제목 단위 청크로 잘라 벡터 DB에 넣기 직전 형태(JSONL)로 저장하는 과정을 다룹니다.

## 요구사항

> 사내 개발자 지원 챗봇이 Crawl4AI 공식 문서(`docs.crawl4ai.com`)를 근거로 답하게 하고 싶다.
> - `core`, `advanced`, `extraction` 섹션만 수집한다(블로그·릴리스 공지는 제외).
> - 왼쪽 목차, 상단 메뉴, 푸터는 청크에 들어가면 안 된다.
> - 청크는 "어느 페이지의 어느 제목 아래 내용인지"를 알 수 있어야 한다(답변에 출처 링크를 달기 위해).
> - 같은 안내 문구가 여러 페이지에 반복되면 한 번만 저장한다.
> - 사이트에 부담을 주지 않도록 최대 80페이지, `robots.txt`를 지킨다.

---

## 구현

```python
# ingest_docs.py
import asyncio
import hashlib
import json
import re
from pathlib import Path

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.content_filter_strategy import PruningContentFilterLXML
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
from crawl4ai.deep_crawling import BFSDeepCrawlStrategy
from crawl4ai.deep_crawling.filters import FilterChain, DomainFilter, URLPatternFilter

START_URL = "https://docs.crawl4ai.com/"
OUT_FILE = Path("corpus/crawl4ai-docs.jsonl")
HEADING = re.compile(r"^(#{1,3})\s+(.+)$")


def build_run_config() -> CrawlerRunConfig:
    return CrawlerRunConfig(
        deep_crawl_strategy=BFSDeepCrawlStrategy(
            max_depth=2,                 # 시작 페이지 + 2단계
            include_external=False,
            max_pages=80,
            filter_chain=FilterChain([
                DomainFilter(allowed_domains=["docs.crawl4ai.com"]),
                URLPatternFilter(patterns=["*/core/*", "*/advanced/*", "*/extraction/*"]),
            ]),
        ),
        excluded_tags=["nav", "footer", "aside"],
        markdown_generator=DefaultMarkdownGenerator(
            content_filter=PruningContentFilterLXML(threshold=0.48, threshold_type="fixed"),
            options={"ignore_images": True},  # 이미지 링크는 검색 품질에 도움이 안 됨
        ),
        check_robots_txt=True,
        cache_mode=CacheMode.ENABLED,     # 재실행 시 이미 받은 페이지는 캐시에서
        stream=True,                      # 한 페이지씩 받는 즉시 처리
    )


def split_by_headings(markdown: str, url: str, max_chars: int = 2000) -> list[dict]:
    """h1~h3 기준으로 자르고, 각 청크에 제목 경로를 붙인다."""
    chunks: list[dict] = []
    path: list[str] = []
    buf: list[str] = []
    in_code = False

    def flush() -> None:
        text = "\n".join(buf).strip()
        for i in range(0, len(text), max_chars):  # 너무 긴 섹션은 길이로 한 번 더 자름
            chunks.append({"url": url, "heading": " > ".join(path), "text": text[i:i + max_chars]})
        buf.clear()

    for line in markdown.splitlines():
        if line.startswith("```"):
            in_code = not in_code         # 코드 블록 안의 # 주석을 제목으로 오인하지 않기
        match = None if in_code else HEADING.match(line)
        if match:
            flush()
            level = len(match.group(1))
            path[:] = path[: level - 1] + [match.group(2).strip()]
        buf.append(line)
    flush()
    return chunks


async def main() -> None:
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    pages = failed = 0

    async with AsyncWebCrawler(config=BrowserConfig(headless=True, text_mode=True)) as crawler:
        with OUT_FILE.open("w", encoding="utf-8") as out:
            async for result in await crawler.arun(START_URL, config=build_run_config()):
                if not result.success:
                    failed += 1
                    print(f"[skip] {result.url} {result.status_code} {result.error_message}")
                    continue

                pages += 1
                markdown = result.markdown.fit_markdown or result.markdown.raw_markdown
                for chunk in split_by_headings(markdown, result.url):
                    digest = hashlib.sha256(chunk["text"].encode("utf-8")).hexdigest()
                    if digest in seen:
                        continue          # 여러 페이지에 반복되는 안내 문구 제거
                    seen.add(digest)
                    chunk.update(
                        id=digest[:16],
                        title=(result.metadata or {}).get("title"),
                        depth=(result.metadata or {}).get("depth", 0),
                    )
                    out.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    print(f"pages={pages} failed={failed} chunks={len(seen)} -> {OUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
```

저장된 JSONL 한 줄은 다음과 같은 모양입니다(값은 설명을 위한 예시입니다).

```json
{"url": "https://docs.crawl4ai.com/core/deep-crawling/", "heading": "Deep Crawling > 3. Streaming vs. Non-Streaming Results", "text": "## 3. Streaming vs. Non-Streaming Results\n...", "id": "5c1e0b7a9d2f4e31", "title": "Deep Crawling", "depth": 1}
```

이 파일을 임베딩 모델에 넣고 벡터 DB에 저장하는 단계는 Crawl4AI의 역할 밖입니다. LangChain, LlamaIndex, 또는 직접 작성한 임베딩 스크립트 어느 쪽이든 이 JSONL을 그대로 입력으로 쓸 수 있습니다.

---

## 실행 흐름

```text
ingest_docs.py 실행
 ↓
AsyncWebCrawler: Chromium 시작 (text_mode로 이미지 로딩 끔)
 ↓
BFSDeepCrawlStrategy: 시작 페이지 크롤 → 링크 추출
 ↓  (depth 1, 2의 링크마다)
FilterChain: 도메인 · URL 패턴 검사 → 통과한 URL만 대기열에
 ↓
robots.txt 검사 → 페이지 렌더링 → cleaned_html (nav · footer · aside 제거)
 ↓
DefaultMarkdownGenerator: raw_markdown + PruningContentFilterLXML로 fit_markdown
 ↓  (stream=True라 페이지 하나가 끝날 때마다 async for로 전달)
split_by_headings: 제목 경로를 붙인 청크로 분할
 ↓
SHA-256 중복 제거 → JSONL에 기록
 ↓
max_pages(80) 도달 또는 대기열 소진 → 브라우저 종료
```

---

## 코드 설명

1. **`max_depth`와 `max_pages`를 함께 둡니다.** 문서 사이트는 링크가 촘촘해서 깊이 2만으로도 수백 페이지가 될 수 있습니다. 깊이는 "얼마나 멀리", 페이지 수는 "얼마나 많이"를 각각 제한합니다. 시작 URL 자체는 필터를 거치지 않고, 필터는 거기서 발견한 링크(depth 1 이상)에만 적용됩니다.
2. **`excluded_tags`와 본문 필터는 역할이 다릅니다.** `excluded_tags`는 의미가 확실한 태그(`nav`, `footer`, `aside`)를 정제 단계에서 지웁니다. `PruningContentFilterLXML`은 태그 이름으로 판단할 수 없는 군더더기(목차 역할을 하는 `div`, 링크만 모인 블록)를 점수로 걸러 `fit_markdown`을 만듭니다. `header`는 문서 제목(`h1`)을 감싸는 경우가 있어 일부러 빼지 않았습니다.
3. **`fit_markdown`이 비면 `raw_markdown`으로 대체합니다.** 본문이 아주 짧은 페이지는 필터가 대부분을 잘라 낼 수 있습니다. 대체 경로를 두면 페이지가 통째로 사라지지 않습니다.
4. **청크마다 제목 경로를 붙입니다.** "Deep Crawling > 3. Streaming vs. Non-Streaming Results"처럼 경로가 있으면, 검색된 청크만 보고도 어떤 맥락의 내용인지 알 수 있고 답변에 출처를 달기 쉽습니다. Markdown 구조가 보존되기 때문에 가능한 분할 방식입니다.
5. **코드 블록 안의 `#`을 제목으로 보지 않습니다.** 문서 사이트에는 셸 주석(`# 설치`)이 많아서, 이 처리가 없으면 코드 예제가 엉뚱한 청크로 쪼개집니다.
6. **`stream=True`로 받는 즉시 씁니다.** 80페이지 결과를 메모리에 모았다가 한 번에 처리하지 않고, 페이지 하나가 끝날 때마다 파일에 기록합니다. 중간에 실패해도 그때까지의 결과가 남습니다.
7. **실패는 결과로 확인합니다.** deep crawl 중 일부 페이지가 타임아웃되거나 `robots.txt`로 거부되어도 예외가 나지 않고 `success=False` 결과가 섞여 옵니다.

---

## 왜 이렇게 사용하는가?

RAG 품질은 검색 단계에서 결정되는 경우가 많고, 검색 품질은 **청크에 무엇이 들어 있는가**에 크게 좌우됩니다. 모든 청크에 같은 목차와 메뉴가 섞여 있으면 질문과 무관한 청크끼리 서로 비슷해져 검색 순위가 흐려집니다. 그래서 수집 단계에서 군더더기를 걷어 내는 것이 임베딩 모델을 바꾸는 것보다 효과가 큰 경우가 많습니다.

이 예제는 그 일을 다음처럼 나눴습니다.

- **어떤 페이지를 볼지**는 deep crawl 전략과 필터 체인이 정합니다.
- **페이지 안에서 무엇을 남길지**는 `excluded_tags`와 본문 필터가 정합니다.
- **어떻게 자를지**는 Markdown 제목 구조를 이용해 애플리케이션 코드가 정합니다.

각 단계가 분리되어 있어서, 예를 들어 질문과 관련 있는 문단만 남기고 싶다면 본문 필터만 `BM25ContentFilter(user_query=...)`로 바꾸고 나머지는 그대로 둘 수 있습니다.

### 변형: 페이지 수가 부족할 때는 우선순위로 고르기

`max_pages`보다 후보 페이지가 훨씬 많다면 BFS는 "먼저 발견한 순서"로 예산을 씁니다. 중요한 페이지를 먼저 받고 싶다면 `BestFirstCrawlingStrategy`에 키워드 점수기를 붙입니다.

```python
from crawl4ai.deep_crawling import BestFirstCrawlingStrategy
from crawl4ai.deep_crawling.scorers import KeywordRelevanceScorer

strategy = BestFirstCrawlingStrategy(
    max_depth=3,
    include_external=False,
    max_pages=40,
    url_scorer=KeywordRelevanceScorer(keywords=["extraction", "markdown", "deep", "cache"], weight=0.7),
)
```

질문이 정해져 있고 "답할 만큼 모이면 멈추는" 수집을 원한다면 `AdaptiveCrawler`도 선택지입니다. Coverage(질의어를 얼마나 다루는지), Consistency(페이지 간 정보가 일관적인지), Saturation(새 페이지가 더 이상 정보를 늘리지 않는지)으로 충분한지 판단하고, 기본값은 신뢰도 0.7, 최대 20페이지입니다. 다만 사이트 전체를 보관하는 용도에는 맞지 않습니다.

### 재실행과 증분 수집

`CacheMode.ENABLED`로 두면 같은 스크립트를 다시 돌릴 때 이미 받은 페이지는 로컬 캐시에서 읽습니다. 청크 분할 규칙만 바꿔 다시 만들 때 사이트를 다시 두드리지 않아도 됩니다. 반대로 문서 갱신을 반영해야 하는 정기 배치라면 `check_cache_freshness=True`를 추가해, ETag·Last-Modified가 바뀐 페이지만 새로 받게 합니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 구조화 데이터 추출 →](04-usage-structured-extraction.md)
