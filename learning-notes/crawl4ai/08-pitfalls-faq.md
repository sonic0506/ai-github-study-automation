# Crawl4AI 주의할 점과 FAQ

> 운영하면서 신경 써야 할 성능·보안·비용·법적 문제와 Breaking Change, 그리고 처음 쓸 때 자주 헷갈리는 질문을 다룹니다.

## 사용할 때 주의할 점

**성능과 메모리**
- 브라우저 탭 하나가 수십~수백 MB를 씁니다. `arun_many`는 dispatcher가 메모리 사용률을 보며 동시 실행을 조절하지만, `max_session_permit`의 기본값은 문서(10)와 v0.9.4 코드(20)가 다르게 적혀 있으므로 **항상 명시적으로 지정**합니다.
- 이미지가 필요 없으면 `BrowserConfig(text_mode=True)`로 이미지 로딩을 끕니다. Docker 서버의 기본 설정도 `text_mode`를 켭니다.
- deep crawl에서 `max_depth`를 3보다 크게 잡으면 페이지 수가 기하급수로 늘어납니다. 깊이와 함께 `max_pages`를 반드시 둡니다. Docker 서버는 기본으로 깊이 5, 페이지 100으로 제한합니다.
- 오래 도는 서버에서는 브라우저 context에 쿠키·스토리지가 쌓여 점점 느려집니다. v0.9.4부터 서버는 페이지 200개마다 context를 교체합니다(`crawler.pool.max_pages_before_recycle`). 라이브러리를 장시간 쓰는 워커라면 일정 작업 수마다 크롤러를 다시 여는 방식으로 같은 효과를 냅니다.

**동시성**
- `session_id`는 탭 하나를 가리킵니다. 같은 세션을 여러 코루틴이 동시에 쓰면 서로의 페이지 조작이 섞이므로, 세션은 작업 하나에만 쓰고 끝나면 `kill_session`으로 닫습니다.

**보안 (특히 Docker 서버)**
- 2026년 6월부터 9월 사이 SSRF, 임의 파일 쓰기, 원격 코드 실행, XSS를 포함한 보안 권고가 여러 차례 공개·수정되었습니다. 공식 보안 정책상 지원 버전은 0.9.x뿐이고 **이전 버전으로 수정이 역이식되지 않습니다.** 서버는 최신 패치(2026년 10월 기준 0.9.4)로 유지합니다.
- `CRAWL4AI_API_TOKEN`을 설정하고, TLS 리버스 프록시 뒤 사내망에만 둡니다. `CRAWL4AI_ALLOW_INTERNAL_URLS`, `CRAWL4AI_ALLOW_INSECURE_TLS`, `CRAWL4AI_HOOKS_ENABLED`는 내부 테스트처럼 이유가 분명할 때만 켭니다.
- 크롤링한 HTML은 외부에서 온 데이터입니다. `cleaned_html`을 관리 화면 등에 그대로 렌더링하면 XSS가 될 수 있으므로 이스케이프하거나 Markdown·텍스트로만 표시합니다.
- 크롤링한 텍스트를 에이전트나 LLM에 넣을 때는 **프롬프트 인젝션**을 전제로 합니다. 페이지 안의 "이전 지시를 무시하고…" 같은 문장도 그대로 모델에 들어갑니다. 크롤 결과를 읽는 에이전트에게는 파일 삭제·메시지 발송 같은 위험한 도구 권한을 함께 주지 않는 것이 안전합니다.

**비용**
- `LLMExtractionStrategy`, `LLMContentFilter`는 페이지마다, 긴 페이지는 청크마다 LLM을 호출합니다. 대량 수집 전에 몇 페이지로 `show_usage()`를 확인하고, 반복 구조 페이지는 `agenerate_schema`로 스키마를 한 번 만든 뒤 CSS 추출로 돌립니다.
- `input_format="fit_markdown"`으로 본문만 보내면 토큰이 크게 줄어듭니다.

**법적·윤리적 고려**
- `check_robots_txt`의 기본값은 `False`입니다. 공개 사이트를 수집한다면 직접 켭니다.
- 도구가 수집을 허락해 주지는 않습니다. 대상 사이트의 이용 약관, 저작권, 개인정보 포함 여부를 먼저 확인하고, `RateLimiter`로 요청 속도를 제한합니다.

**라이선스**
- 코드 라이선스는 Apache 2.0입니다. 다만 README의 "License & Attribution" 절은 출처 표시를 "권장한다(recommended)"는 문장과 "배지나 문구 중 하나를 포함해야 한다(must include)"는 문장을 함께 담고 있습니다. 두 문구의 법적 관계가 명확하지 않으므로, 제품에 포함한다면 배지나 문구로 출처를 표시해 두고 필요하면 법무 검토를 받는 편이 안전합니다.

**유지보수와 의존성**
- 패키지 분류는 `Development Status :: 4 - Beta`이고 버전은 0.x입니다. 라이브러리 버전과 Docker 이미지 태그를 고정하고, 올릴 때는 CHANGELOG의 Breaking Changes와 Deprecated 항목을 먼저 확인합니다.
- `unclecode-litellm`(LiteLLM 포크)이 정확한 버전으로 고정되어 있어 upstream `litellm`을 쓰는 프로젝트와 같은 환경에 두면 충돌할 수 있습니다. 크롤러는 별도 가상 환경이나 서비스로 분리하는 것을 권장합니다.
- 공개 분류자는 Python 3.10~3.13입니다(2026년 10월 기준). 3.14 관련 수정이 일부 들어가고 있지만, 공식 지원 범위로 명시되기 전까지는 3.13 이하에서 운영하는 편이 안전합니다.

**Breaking Change와 Deprecated 사용 방식**
- **v0.9.0 (2026-06, Docker 서버만)**: 인증 기본 활성화, 토큰 없으면 loopback 바인딩, 기존 JWT 토큰 무효화, `js_code`·`proxy_config`·`cookies`·`headers`·`deep_crawl_strategy` 등 요청 필드 거부, `hooks.code` 제거와 선언형 hook 도입, `output_path` 대신 `artifact_id`, LLM `base_url` 요청 지정 제거, CORS 기본 거부, TLS 검증 기본 활성화, Redis 비밀번호 필수. pip 라이브러리는 변경되지 않았습니다. 이전 절차는 저장소의 `deploy/docker/MIGRATION.md`에 있습니다.
- **SDK의 함수형 hook**: Python 함수를 `Crawl4aiDockerClient`의 hook으로 넘기는 방식은 서버에서 더 이상 동작하지 않습니다. 함수 hook이 필요하면 라이브러리(`AsyncWebCrawler`)를 직접 씁니다.
- **v0.9.4**: `PruningContentFilter` 직접 사용 시 `DeprecationWarning`. 같은 인자를 받는 `PruningContentFilterLXML`로 바꿉니다.
- **오래된 사용 방식**: `arun(url, bypass_cache=True, word_count_threshold=...)`처럼 키워드 인자를 직접 넘기는 방식은 `CrawlerRunConfig`로, `bypass_cache`·`disable_cache` 같은 불리언 플래그는 `CacheMode`로, 전략 생성자의 `provider`·`api_token` 인자는 `llm_config=LLMConfig(...)`로 옮깁니다.

---

## 자주 헷갈리는 부분

### Q. `fit_markdown`이 항상 빈 문자열입니다. 버그인가요?

아닙니다. `fit_markdown`은 본문 필터의 결과이므로, `DefaultMarkdownGenerator(content_filter=PruningContentFilterLXML())`처럼 필터를 설정해야 채워집니다. 필터 없이 쓰면 `raw_markdown`만 의미가 있습니다. 필터를 설정했는데도 비어 있다면 기준값이 너무 높거나 본문을 감싼 상위 노드가 통째로 잘린 경우로, [Markdown 생성 파이프라인 깊이 보기](07-markdown-pipeline.md#pruningcontentfilter-점수로-가지치기)의 튜닝 방법을 참고합니다.

### Q. `result.markdown`은 문자열인가요, 객체인가요?

둘 다입니다. 문자열의 하위 클래스라서 `print(result.markdown)`이나 문자열 연산을 하면 `raw_markdown`처럼 동작하고, 동시에 `.fit_markdown`, `.markdown_with_citations`, `.references_markdown` 같은 속성으로 다른 버전에 접근할 수 있습니다. 예전 버전과의 호환을 위한 설계입니다.

### Q. 캐시를 켠 적이 없는데 캐시가 동작하나요?

`CrawlerRunConfig`를 넘기면 `cache_mode` 기본값은 `CacheMode.BYPASS`라서 캐시를 읽지도 쓰지도 않습니다. 개발 중 같은 페이지를 반복해서 받지 않으려면 `CacheMode.ENABLED`를 명시합니다. 캐시는 `~/.crawl4ai/crawl4ai.db`에 저장됩니다.

### Q. 크롤링이 실패했는데 예외가 나지 않습니다.

Crawl4AI는 페이지 단위 실패(타임아웃, 차단, `robots.txt` 거부)를 예외 대신 `success=False`인 `CrawlResult`로 돌려줍니다. `arun_many`나 deep crawl에서 일부만 실패해도 전체가 멈추지 않게 하기 위한 설계입니다. 결과마다 `success`, `status_code`, `error_message`를 확인하고, CSS 추출이 "성공했지만 0건"인 경우도 별도로 감시해야 합니다.

### Q. 라이브러리에서 되던 `js_code`가 Docker 서버에서는 400 오류가 납니다.

의도된 동작입니다. v0.9.0부터 서버는 요청 본문을 신뢰하지 않으며, JavaScript 코드·프록시·쿠키·헤더·세션·deep crawl 같은 필드를 네트워크로 받으면 거부합니다. 이런 작업은 서버 쪽 설정으로 고정하거나, 라이브러리를 내장한 워커로 처리합니다. 자세한 목록은 [활용 예시 ③ 자체 서버·에이전트·운영](05-usage-self-hosted-server.md#서버가-요청으로-받지-않는-것)에 정리했습니다.

### Q. LLM API 키가 꼭 필요한가요?

아닙니다. 크롤링, Markdown 변환, Pruning·BM25 필터, CSS·XPath·정규식 추출, deep crawl은 모두 LLM 없이 동작합니다. 키가 필요한 것은 `LLMExtractionStrategy`, `LLMContentFilter`, 스키마 자동 생성(`agenerate_schema`), CLI의 질문 기능(`crwl -q`)처럼 이름에 LLM이 드러나는 기능뿐입니다. Ollama 같은 로컬 모델도 LiteLLM 제공자 이름으로 지정할 수 있습니다.

### Q. stealth 모드를 켜면 봇 차단을 우회할 수 있나요?

일부 단순한 자동화 탐지는 피할 수 있지만 보장되지 않습니다. `enable_stealth`, undetected 브라우저 어댑터, 프록시 회전은 도구일 뿐이고, 고급 봇 방어 앞에서는 주거용 프록시 같은 추가 자원이 필요합니다. 그 이전에 대상 사이트가 자동 수집을 허용하는지부터 확인해야 합니다. 차단 대응까지 맡기고 싶다면 호스팅형 서비스(Crawl4AI Cloud 등)를 검토합니다.

### Q. `result.fit_html`과 `result.markdown.fit_html`은 같은 건가요?

다릅니다. `result.fit_html`은 LLM 스키마 생성용으로 원본 HTML을 축약한 것이고, `result.markdown.fit_html`은 본문 필터가 남긴 HTML 조각으로 `fit_markdown`의 직접적인 입력입니다. 필터 결과를 확인하려면 후자를 봅니다.

### Q. 라이브러리로 쓸지 Docker 서버로 쓸지 어떻게 정하나요?

Python 프로세스 하나에서 쓰고, 로그인·JS 조작·deep crawl처럼 세밀한 제어가 필요하면 라이브러리입니다. 여러 언어의 서비스나 에이전트가 공유해야 하고, 브라우저 관리를 한곳에 모으고 싶다면 Docker 서버입니다. 둘을 함께 쓰는 구성도 흔합니다. 단순한 Markdown 변환은 서버로, 복잡한 수집은 전용 워커의 라이브러리로 처리합니다.

---

[← Markdown 생성 파이프라인 깊이 보기](07-markdown-pipeline.md) · [목차](README.md)
