---
repository: KKKKhazix/AIHOT
url: https://github.com/KKKKhazix/AIHOT
stars: 4,070
studiedAt: 2026-10-01
status: draft
---

# KKKKhazix/AIHOT

AIHOT은 정보원에서 자료를 모아 LLM으로 선별·채점하고, 같은 사건을 묶어 핫이슈 순위와 일간 리포트를 자동으로 만드는 셀프호스팅 사이트 프레임워크입니다. 운영 중인 aihot.news의 전체 코드이며, 정보원과 선별 기준만 바꾸면 다른 업계의 핫이슈 사이트로 쓸 수 있다고 합니다.

## 01. 어떤 문제를 푸는가

업계 소식을 매일 따라가려면 여러 매체에서 같은 사건을 반복해서 읽고, 무엇이 중요한지 직접 골라야 합니다. AIHOT은 수집·선별·요약·사건 묶기·리포트 발행을 파이프라인으로 자동화하고, 선별 기준을 프롬프트와 임계값 파일로 분리해 업계 지식(KnowHow)만 바꿔 끼우도록 합니다.

- 저장소는 2026-09-28T23:40:05Z에 만들어졌고, 조회 시점(2026-10-01) Star 4111, Fork 1189, 열린 이슈 19건[^s2]
- MIT 라이선스. 단, AIHOT 이름과 로고는 라이선스 범위에 포함되지 않음[^s1]
- 토픽 : ai, content-curation, llm, mcp, news-aggregator, rss, self-hosted, typescript[^s2]
- 기술 스택 : Node.js 24, TypeScript, React Router(서버 렌더링), Fastify, PostgreSQL, pg-boss, Tailwind CSS, Docker Compose[^s1]
- package.json의 engines는 node >=24.11. Docker 없이 쓰면 Node.js 24.11 이상과 PostgreSQL 16 또는 17이 필요함[^s13][^s5]
- 모든 단계의 프롬프트 원문과 입선 임계값이 저장소에 포함됨. 프롬프트는 industry/prompts/에 있어 기준을 바꿀 때 코드를 고치지 않아도 됨[^s1]
- 실제 aihot.news의 정보원 목록과 운영 데이터는 포함되지 않고, 공개 해외 AI 뉴스 정보원 18개가 예시로 들어 있음[^s1]
- 기본 임계값은 T1 60, T1_5 65, T2 76, understandFloor 50 (industry/selection.ts)[^s4]
- 모델은 OpenAI 호환 API Key 하나가 필요함. README는 DeepSeek, 千问(Qwen), 智谱(Zhipu)를 예로 듦[^s1]
- README의 운영 측정값 : 페이지 중앙값 10ms·95%가 50ms 이내, API 중앙값 6ms·95%가 12ms 이내, 기사 페이지 95%가 14ms 이내[^s1]
- 예시 정보원으로 로컬에서 처음 돌렸을 때 첫 수집 자료 152건에 모델 호출이 약 930번 쓰였다고 함[^s5]
- 작성자는 디자이너 출신이며 코드는 AI와 함께 다시 작성했고, 운영 중인 코드의 스냅샷이라 이후 동기화를 보장하지 않는다고 밝힘[^s1]
- GitHub Release와 태그는 조회 시점에 하나도 없음[^s15]

## 02. 핵심 구조

- api (apps/api/) : Fastify 서버. 사이트용 API(/api/site/), 공개 API(/api/v1/), RSS, MCP, 관리자 API, 이미지 프록시, 공유 이미지를 담당함[^s3]
- worker (apps/worker/) : pg-boss 작업 큐와 예약 작업. 정보원 수집, 모델 호출, 사건 묶기, 화제도, 일간 리포트, 알림, 정리를 실행함[^s3]
- web (apps/web/) : React Router 서버 렌더링 웹페이지. HTTP로 api만 읽고 데이터베이스에는 접근하지 않음[^s3]
- packages/backend/src/publication/ : 공개 읽기 계층. 웹페이지·RSS·API·MCP·사이트맵·공유 이미지가 모두 여기서 읽어 출구별 내용이 같게 유지됨[^s3]
- packages/backend/src/providers/ : 모델·벡터·X·위챗 공식계정·Jina 호출과 영수증(receipts)·예산 관리[^s3]
- industry/ : 업계 패키지. 사이트명·문구, 분류·태그, 주제, 예시 정보원, 프롬프트, 임계값, 브랜드, 약관 페이지를 담음[^s1][^s3]
- docker compose 구성 : db(PostgreSQL 17), setup(마이그레이션·시드 후 종료), api, worker, web 다섯 개 컨테이너를 띄움[^s5]
- 페이지는 모델을 호출하지 않음 : 독자가 여는 페이지는 DB에 저장된 결과만 읽고, 모델은 worker 작업 안에서만 호출함[^s3]
- 유료 요청 영수증 : 모델·X·공식계정·Jina 유료 요청마다 영수증을 먼저 기록하고 결과를 저장한 뒤 사용함. 재시작·재시도 시 이미 비용을 낸 결과를 재사용함 (providers/receipts.ts)[^s3]

## 03. 주요 기능

- 정보원 6종 : rss, web_list(선택자 지정, 필요하면 Jina Reader 렌더링), json_list, x_search(SocialData key), mp_account(위챗 공식계정, 极致了 key), external(자체 스크립트 푸시)[^s1][^s6]
- 정보원 등급 : T1 공식 1차, T1_5 공식 계정·준공식 창작자, T2 매체·개인, EXCLUDE_MP는 선별 제외. 등급마다 입선 임계값이 다름[^s6]
- 선별 파이프라인 : 수집·중복 제거 → 사전 필터(prefilter.md, BLOCK/PASS/UNKNOWN) → 같은 기준으로 0–100점 독립 채점 2회 → 두 점수 합이 2 × 임계값 이상이면 입선[^s1][^s4]
- 제목·요약 작성 : 입선 자료와 평균 점수가 understandFloor를 넘는 자료는 content-understanding.md로 중국어 제목, 답을 먼저 쓰는 요약, 추천 이유, 태그를 작성함. 나머지는 summarize-*.md로 짧게 작성함[^s4]
- 사건 묶기(클러스터링) : 제목·요약 벡터로 최근 2주 안에서 후보를 찾고, 모델이 같은 사건·후속 진행·별개 사건을 판단함. 애매하면 합치고 다른 모델로 한 번 더 확인함[^s1]
- 화제도 계산 : 기사 단위가 아닌 사건 단위로 계산함. 48시간 안에서 독립 정보원 하나당 한 번만 세고, 24시간마다 절반으로 감쇠함[^s1]
- 일간·주간·월간 리포트 : 매일 08:00 일간 리포트, 매주 월요일 10:00 주간 리포트, 매월 1일 10:30 월간 리포트를 발행함[^s1][^s4]
- Agent용 출구 : RSS(/feed.xml, /feed/all.xml, /feed/full.xml, /feed/daily.xml), 공개 API(/api/v1/, 문서 /openapi-v1.json), MCP(/api/mcp), /llms.txt 제공[^s1][^s3]
- 관리자 화면 : 정보원 관리·시험 수집, 콘텐츠 진단, 선별 평가(SelectBench), 단계별 모델 교체, 유료 서비스 예산 차단, 실행 기록·알림[^s1]
- 외부 푸시 API : POST /api/ingest/items에 Bearer INGEST_TOKEN으로 항목을 넣으면 일반 수집과 같은 중복 제거·선별·묶기를 거침. 요청당 최대 50건, 클라이언트당 분당 10회[^s6]
- AI 전용 모듈 : 모델 순위표와 Codex 리셋 모니터링. 다른 업계에서는 industry/features.ts 스위치로 끔[^s1]

## 04. 시작하기

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
# .env 생성 (임의 키와 관리자 비밀번호 채움)
node scripts/init-env.ts --llm-key <모델 API Key>
# 컨테이너 빌드·실행
docker compose up -d --build
```

```bash
# http://localhost:3000 접속, 관리자 화면은 /admin (비밀번호는 .env의 ADMIN_PASSWORD)

# 직접 라벨링한 샘플로 선별 기준 평가
node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --split development --label "第一版评分标准"

# 로그 확인
docker compose logs -f --tail 100 api worker web

# 업데이트 (마이그레이션은 자동 실행)
git pull
docker compose up -d --build

# 수동 백업
docker compose exec -T db pg_dump -U aihot aihot | gzip > myhot-$(date +%F).sql.gz
```

설치와 예제는 공식 문서 기준입니다.[^s1][^s4][^s5]

## 05. 커뮤니티에서 반복되는 주제

- 정보원 목록 공유 요청(#13) : 기본 예시 18개가 부족하다는 요청. 관리자는 컴플라이언스·위험 문제로 aihot.news 전체 목록은 공유할 수 없다고 답하고 not planned로 닫음[^s9]
- 중국 플랫폼 수집 요청(#17) : 샤오훙수·웨이보는 크롤링 차단이 엄격하고 방식이 자주 바뀌어 전용 어댑터를 유지하지 않는다고 답함. 별도 수집 프레임워크를 붙여 쓰라고 권함[^s10]
- 정보원 추가 예시 요청(#31, 열림) : web_list가 div 블록 목록을 잡기 어렵고 X 정보원 예시가 없다는 보고. rss와 web_list만 추가에 성공했다고 함[^s12][^s7]
- 주간 리포트 REST API 요청(#18, 열림) : 관리자는 공개된 주간 리포트 조회 API를 검토하겠지만 일정은 정해지지 않았다고 답함[^s11][^s7]
- 외부 기여자의 코드 리뷰 기반 버그 보고(#12) : 결과 불명 영수증을 해제해도 기사가 다시 큐에 들어가지 않는 문제. runs.ts 조건이 항상 거짓이라는 분석이 붙었고 COMPLETED로 닫힘[^s8]
- 공개 직후 수정 커밋 집중 : 2026-09-29~30에 MCP smoke check, 모델 필터, ingest 입력 검증, 일시정지 외부 정보원 푸시 거부, SelectBench 평가 안정화 등 fix 커밋이 이어짐[^s14]

## 06. 한계와 주의점

- 문서가 중국어로만 작성됨. README 끝의 영어 요약 한 단락만 예외[^s1]
- 버전 릴리스가 없어 main 브랜치를 그대로 따라가야 함. 업데이트는 git pull 후 docker compose up -d --build[^s15][^s5]
- 기본 임계값은 AI 분야 기준이라 엄격한 편임. 업계나 채점 기준을 바꾸면 100–200건 라벨링 샘플로 다시 보정해야 함[^s4]
- 첫 실행 후 1~2분 뒤 콘텐츠가 보이기 시작하고, 첫 수집 자료 처리에는 약 30분이 걸린다고 함[^s1][^s5]
- 클라우드 서버는 이미지 빌드 때문에 최소 2코어, 4GB 메모리를 권장함[^s5]
- X(SocialData), 위챗 공식계정(极致了), Jina는 요청 단위 과금. 기본은 꺼져 있고 key를 넣어야 사용됨. 서비스별 분·시간·일 상한으로 차단 가능[^s5][^s6]
- 전문(full text) 표시는 site_fulltext, syndicate_fulltext로 정하며 기본은 둘 다 꺼져 있어 요약과 원문 링크만 보임[^s6]
- 발견 시점에 48시간이 지난 자료, 새 정보원의 기존 항목, backfill 푸시는 원문 시간으로 보관되고 '오늘'과 푸시에 나오지 않음[^s3][^s6]
- 중국 본토 서버는 npm 미러 빌드, EGRESS_PROXY_URL 설정, ICP 등록(industry/site.ts의 icp)이 필요함[^s5]
- docker compose down -v는 db, data, caddy 볼륨을 삭제함[^s5]
- 샤오훙수·웨이보 같은 중국 플랫폼 전용 수집은 유지하지 않기로 함[^s10]
- 테스트는 이름이 _test 또는 _ci로 끝나는 빈 DB가 필요함[^s3]

## 07. 더 알아볼 것

- GitHub Release와 태그가 없어 버전 체계와 변경 이력은 커밋 기록으로만 확인할 수 있습니다.
- 운영 중인 aihot.news와 이 저장소 사이의 동기화 주기는 공개 자료에서 확인하지 못했습니다.
- OpenAI 호환 API 외에 단계별로 어떤 모델이 기본값으로 쓰이는지(editorial/models.ts)는 직접 확인하지 못했습니다.
- 벡터 검색에 쓰는 임베딩 모델과 저장 방식(pgvector 사용 여부 등)은 확인하지 못했습니다.
- docs/customize.md, docs/grouping.md, docs/leaderboard.md는 읽지 않았습니다.
- 리포트 기준 Star는 4070개, 24시간 증가량은 +997입니다. 조사 시점 API 값은 4111개로 리포트보다 41개 많습니다.

## 참고 자료

- [AIHOT README (main)](https://github.com/KKKKhazix/AIHOT/blob/main/README.md) (readme)
- [KKKKhazix/AIHOT 저장소 페이지 (GitHub API 메타데이터)](https://github.com/KKKKhazix/AIHOT) (code)
- [架构 (docs/architecture.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/architecture.md) (docs)
- [精选与校准 (docs/selection.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/selection.md) (docs)
- [部署 (docs/deploy.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/deploy.md) (docs)
- [信源 (docs/sources.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/sources.md) (docs)
- [Issues 목록](https://github.com/KKKKhazix/AIHOT/issues) (issues)
- [#12 放行结果不明的回执后，文章不会重新排队](https://github.com/KKKKhazix/AIHOT/issues/12) (issues)
- [#13 可以共享一下aihot.news的信源吗？](https://github.com/KKKKhazix/AIHOT/issues/13) (issues)
- [#17 对于小红书、微博等渠道有考虑加入吗](https://github.com/KKKKhazix/AIHOT/issues/17) (issues)
- [#18 周报 REST api 接口](https://github.com/KKKKhazix/AIHOT/issues/18) (issues)
- [#31 希望完善各种信源的添加DEMO](https://github.com/KKKKhazix/AIHOT/issues/31) (issues)
- [package.json (main)](https://github.com/KKKKhazix/AIHOT/blob/main/package.json) (code)
- [main 브랜치 커밋 기록](https://github.com/KKKKhazix/AIHOT/commits/main) (code)
- [Releases 목록 (비어 있음)](https://github.com/KKKKhazix/AIHOT/releases) (release)

[^s1]: [AIHOT README (main)](https://github.com/KKKKhazix/AIHOT/blob/main/README.md)
[^s2]: [KKKKhazix/AIHOT 저장소 페이지 (GitHub API 메타데이터)](https://github.com/KKKKhazix/AIHOT)
[^s3]: [架构 (docs/architecture.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/architecture.md)
[^s4]: [精选与校准 (docs/selection.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/selection.md)
[^s5]: [部署 (docs/deploy.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/deploy.md)
[^s6]: [信源 (docs/sources.md)](https://github.com/KKKKhazix/AIHOT/blob/main/docs/sources.md)
[^s7]: [Issues 목록](https://github.com/KKKKhazix/AIHOT/issues)
[^s8]: [#12 放行结果不明的回执后，文章不会重新排队](https://github.com/KKKKhazix/AIHOT/issues/12)
[^s9]: [#13 可以共享一下aihot.news的信源吗？](https://github.com/KKKKhazix/AIHOT/issues/13)
[^s10]: [#17 对于小红书、微博等渠道有考虑加入吗](https://github.com/KKKKhazix/AIHOT/issues/17)
[^s11]: [#18 周报 REST api 接口](https://github.com/KKKKhazix/AIHOT/issues/18)
[^s12]: [#31 希望完善各种信源的添加DEMO](https://github.com/KKKKhazix/AIHOT/issues/31)
[^s13]: [package.json (main)](https://github.com/KKKKhazix/AIHOT/blob/main/package.json)
[^s14]: [main 브랜치 커밋 기록](https://github.com/KKKKhazix/AIHOT/commits/main)
[^s15]: [Releases 목록 (비어 있음)](https://github.com/KKKKhazix/AIHOT/releases)
