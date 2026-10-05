# Firecrawl 주의할 점과 FAQ

> 운영하면서 신경 써야 할 비용·rate limit·보안·법적 책임·셀프호스팅·버전 변화 문제와, 처음 쓸 때 자주 헷갈리는 질문을 다룹니다.

## 사용할 때 주의할 점

**비용**
- 기본 Scrape는 페이지당 1 credit이지만 `json`, `question`, `highlights`, `audio`·`video`, PII 제거는 추가 credit이 붙고, PDF는 페이지 수만큼 듭니다. Crawl은 `limit`이 곧 최대 비용이므로 항상 지정합니다.
- 차단되는 사이트는 내부적으로 stealth 프록시로 재시도하면서 비용과 시간이 늘어납니다. 원리는 [스크랩 엔진 워터폴 깊이 보기](07-scrape-engine-waterfall.md#5단계-무엇을-성공으로-보는가)에 있습니다.
- Agent는 탐색 범위를 스스로 정하므로 `maxCredits`로 상한을 둡니다. 큰 작업은 실행당 URL 몇 개 단위로 나누는 것을 공식 문서도 권장합니다.
- 응답의 `metadata.creditsUsed`와 Crawl Job의 `creditsUsed`를 기록해 두면 어떤 요청이 비싼지 나중에 분석할 수 있습니다.

**Rate limit과 동시성**
플랜마다 분당 요청 수와 동시 브라우저 수가 정해져 있고(예: 무료 플랜은 `/scrape` 분당 10회, 동시 브라우저 2개), 넘으면 429를 받습니다. 서버에서는 큐 워커의 동시성과 분당 상한을 플랜 한도보다 낮게 잡고, SDK의 `maxRetries`·`backoffFactor`로 일시적 실패를 흡수합니다.

**결과 보존 기간**
Crawl·Batch·Agent Job 결과는 API로 24시간 동안만 조회됩니다. Webhook이나 완료 직후 처리로 내 저장소에 옮겨야 합니다.

**보안**
- API 키를 프런트엔드나 공개 저장소에 두지 않습니다. 키는 계정 credit을 그대로 소모합니다.
- Webhook은 `X-Firecrawl-Signature`를 원문 바디로 검증하고, 같은 이벤트가 두 번 와도 문제없게 멱등하게 처리합니다.
- 웹 페이지 내용은 신뢰할 수 없는 입력입니다. 에이전트에 넣을 때는 데이터임을 표시하고, 위험한 도구와 같은 에이전트에 함께 두지 않습니다.
- 셀프호스팅 Firecrawl은 내 네트워크 안에서 요청을 보내므로, 사용자가 입력한 URL을 그대로 넘기면 내부 주소를 조회하는 SSRF 통로가 될 수 있습니다. 내부 대역을 차단하는 검증을 앞단에 둡니다.

**법적 책임과 robots.txt**
Firecrawl은 기본적으로 robots.txt를 존중하지만, 사이트 이용약관과 개인정보 관련 법을 지킬 책임은 사용자에게 있다고 명시합니다. 로그인 뒤의 개인 데이터, 이용약관상 수집 금지 사이트, 개인정보가 많은 페이지는 기술적으로 가능해도 수집 전에 검토가 필요합니다.

**셀프호스팅**
- 기본 API는 인증이 없고, Compose 파일은 PostgreSQL·Redis·RabbitMQ에 영속 볼륨을 정의하지 않습니다. 외부에 노출하거나 운영 데이터로 쓰기 전에 인증·TLS·볼륨·백업을 직접 설계합니다.
- 정확한 릴리스 태그를 체크아웃해서 씁니다. `main`과 이미지 태그는 서로 다른 시점에 바뀔 수 있습니다.
- 로컬 LLM(Ollama)으로 JSON 추출을 할 때, 모델의 컨텍스트가 작으면 긴 페이지에서 지시문과 스키마가 잘려 잘못된 값이 나온다는 보고가 있습니다. 컨텍스트가 큰 모델을 쓰거나 `includeTags`로 입력을 줄입니다.
- 큐 관리 UI는 기본으로 꺼져 있습니다. 켤 때는 강한 `BULL_AUTH_KEY`와 네트워크 제한을 함께 둡니다.

**Breaking Change와 Deprecated 사용 방식**
- `/extract` 엔드포인트는 `/agent`로 대체되었고, SDK의 `extract` 메서드도 deprecated입니다.
- `/v0/*` 엔드포인트와 `/v1/extract`, `/v1/deep-research`, `/v1/llmstxt`는 2026년 5월(v2.10)에 deprecated되었습니다. 새 코드는 `/v2`와 v2 SDK 메서드를 씁니다.
- Interact·Browser 요청의 `persistentSession`은 `profile`로, `writeMode`는 `saveChanges`로 이름이 바뀌었습니다. 예전 이름도 당분간 동작하지만 문서에서는 빠졌습니다.
- Agent 모델은 `spark-2`로 통일되었습니다. `spark-1-pro`, `spark-1-mini`는 받아들이지만 내부적으로 `spark-2`로 실행됩니다.
- robots.txt 무시 설정은 boolean에서 `disabled`·`allowed`·`forced` 형태의 조직 플래그로 바뀌었습니다.
- 예전 글의 `@mendable/firecrawl-js`, `FirecrawlApp`, `scrapeUrl`, `crawlUrl`은 v1 SDK 시절 이름입니다. 현재는 `firecrawl` 패키지의 `Firecrawl` 클래스와 `scrape`, `crawl`을 씁니다.

**버전과 릴리스 읽는 법**
GitHub Release는 v2.11.0(2026-06-19)이 마지막이지만, 저장소 태그는 v2.11.454처럼 계속 올라갑니다. 기능 발표는 공식 changelog에, SDK는 npm·PyPI 버전에 따로 반영되므로 세 곳을 함께 봐야 현재 상태를 알 수 있습니다.

**라이선스**
서버 본체는 AGPL-3.0, SDK와 일부 UI 컴포넌트는 MIT입니다. SDK로 클라우드 API를 호출하는 것만으로 AGPL 의무가 생기지는 않지만, 서버 코드를 수정해 네트워크 서비스로 제공한다면 법무 검토가 필요합니다.

---

## 자주 헷갈리는 부분

### Q. Firecrawl은 라이브러리인가요, 서비스인가요?

둘 다입니다. 내 코드에 설치하는 것은 SDK(`firecrawl`, `firecrawl-py`)이고, 실제 수집은 SDK가 호출하는 Firecrawl 서버(클라우드나 셀프호스팅)에서 일어납니다. 그래서 "라이브러리를 업데이트했더니 결과가 바뀌었다"보다 "서버 쪽 엔진·캐시가 바뀌어 결과가 달라졌다"인 경우가 더 많습니다.

### Q. Scrape, Crawl, Map, Batch Scrape는 언제 무엇을 쓰나요?

URL 하나면 Scrape, 사이트 안의 URL 목록만 필요하면 Map, 링크를 따라가며 사이트 전체를 가져오려면 Crawl, URL 목록을 이미 알고 있으면 Batch Scrape입니다. Map으로 목록을 만든 뒤 필요한 것만 골라 Batch Scrape하는 조합은 Crawl보다 범위를 정확히 통제할 수 있습니다.

### Q. `onlyMainContent`를 켰더니 필요한 정보가 사라졌어요.

본문 판별 규칙이 사이드바·헤더에 있는 정보(가격, 날짜, 저자)를 잘라 낼 수 있습니다. JSON 추출도 이 정리된 Markdown을 입력으로 쓰므로 함께 영향을 받습니다. `onlyMainContent: false`로 바꾸거나 `includeTags`로 필요한 영역을 지정합니다. 이유는 [스크랩 엔진 워터폴 깊이 보기](07-scrape-engine-waterfall.md#6단계-변환-파이프라인)에서 설명합니다.

### Q. 방금 바뀐 페이지인데 예전 내용이 와요.

캐시(`maxAge`) 때문입니다. 기본값은 2일이어서 그 안에 저장된 결과가 있으면 재사용됩니다. `maxAge: 0`으로 항상 새로 가져오거나, 신선도 요구에 맞게 값을 줄입니다. `metadata.cacheState`가 `hit`이면 캐시 결과입니다.

### Q. 셀프호스팅하면 클라우드와 같은 기능을 무료로 쓸 수 있나요?

아닙니다. 셀프호스팅 기본 스택에는 Fire-engine이 없어서 차단 대응이 약하고, 스크린샷·페이지 actions·Agent·Interact·일부 특수 포맷이 동작하지 않습니다. 검색과 LLM 기능도 검색 백엔드(SearXNG 등)와 모델 제공자를 직접 연결해야 합니다. 셀프호스팅은 "데이터 경로와 인프라를 통제하는 대신 기능과 운영 책임을 맞바꾸는 선택"입니다.

### Q. JSON 추출 결과를 그대로 DB에 넣어도 되나요?

권하지 않습니다. LLM 추출은 형식은 맞아도 값이 틀릴 수 있습니다. Zod 같은 스키마로 다시 검증하고, 가격 0원·급격한 변화처럼 업무적으로 의심스러운 값은 검토 단계로 보냅니다. 같은 사이트를 반복 추출한다면 결과가 일정한 `deterministicJson` 포맷도 검토할 만합니다.

### Q. Agent와 내 에이전트 + Scrape 도구는 무엇이 다른가요?

Agent는 Firecrawl 서버가 탐색 단계를 정하고 결과만 돌려주는 방식이고, 내 에이전트 + 도구는 어떤 페이지를 읽을지 내 쪽에서 통제하는 방식입니다. 비용 예측과 단계 통제가 중요하면 후자, 빠르게 결과만 필요하면 전자가 맞습니다. 자세한 비교는 [AI 에이전트에 웹 도구 연결하기](04-usage-agent-tools.md#실제-서비스에서는)에 있습니다.

---

[← 스크랩 엔진 워터폴 깊이 보기](07-scrape-engine-waterfall.md) · [목차](README.md)
