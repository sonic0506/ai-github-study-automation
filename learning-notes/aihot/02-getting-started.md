# AIHOT 설치와 첫 실행

> Docker Compose로 AIHOT을 띄우는 방법, 꼭 확인해야 할 `.env` 설정, 처음 켰을 때 무슨 일이 일어나는지, 설치할 때 자주 걸리는 지점을 다룹니다.

## 설치

AIHOT은 npm 패키지가 아니라 저장소를 받아 운영하는 애플리케이션입니다. 필요한 것은 세 가지입니다.

- Docker(Compose 포함)
- Node.js 24 이상: 설정 파일을 만드는 `init-env` 스크립트를 돌릴 때 필요합니다. Docker 없이 직접 띄울 때는 24.11 이상과 PostgreSQL 16 또는 17이 필요합니다.
- OpenAI 호환 모델 API 키 하나: 기본 설정은 DeepSeek이고, Qwen(DashScope), 智谱(GLM) 예시가 `.env.example`에 있습니다. OpenAI 호환 엔드포인트라면 다른 서비스도 쓸 수 있습니다.

**방법 1. 바로 써 보기**

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <모델 API Key>
docker compose up -d --build
```

**방법 2. 내 사이트로 운영할 생각이라면**

- 독립 사이트를 새로 만들려면 GitHub의 **Use this template**으로 저장소를 만든 뒤 그 저장소를 클론합니다.
- 상위 저장소의 업데이트를 계속 합치거나 기여할 생각이면 **Fork**를 권장합니다. AIHOT은 릴리스 없이 `main`이 계속 바뀌므로, 업데이트를 합칠 길을 처음부터 열어 두는 편이 좋습니다.

`init-env.ts`는 `.env`를 만들고 세션·이미지 서명·DB 비밀번호 같은 무작위 키와 관리자 비밀번호를 채운 뒤, 비밀번호를 한 번만 출력합니다. Node가 없는 서버라면 `.env.example`을 복사해 `ADMIN_PASSWORD`(12자 이상), `SESSION_SECRET`, `IMG_PROXY_SIGN_SECRET`, `POSTGRES_PASSWORD`(각각 `openssl rand -hex 32`), `LLM_API_KEY`를 직접 채웁니다.

## 기본 설정

`.env`에서 가장 먼저 볼 항목입니다.

```dotenv
# 독자가 실제로 접속하는 주소. RSS·공유 링크·사이트맵·MCP의 절대 링크가 모두 이 값을 쓴다
SITE_URL=http://localhost:3000

# 모든 단계의 기본 모델 (OpenAI 호환)
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-flash
LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}

# 안전 밸브: 소문자 true일 때만 켜진다
COLLECT_ENABLED=true
MODEL_CALLS_ENABLED=true
```

다른 모델 서비스를 쓴다면 `LLM_BASE_URL`, `LLM_MODEL`, `LLM_EXTRA_JSON`을 함께 바꿉니다. 먼저 생각하고 답하는 추론 모델이라면 `LLM_REASONING_TOKENS`(예: 4000)로 추론용 출력 여유를 따로 줘야 합니다. 주지 않으면 추론이 출력 한도를 다 써 버려 답이 비고, 모든 호출이 `finish_reason=length`로 실패합니다.

선택 항목 중 효과가 큰 것은 임베딩입니다.

```dotenv
# 설정하지 않으면 사건 후보를 글자 겹침으로 찾는다
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
```

임베딩 없이도 돌아가지만, 화제도 증거로만 쓰는 토론글(`hot_signal` 정보원)이 사건에 잘 붙지 않아 화제도가 낮게 나옵니다.

## 가장 간단한 예제

컨테이너를 띄운 뒤 다음을 확인합니다.

```bash
docker compose ps                                 # db, api, worker, web 실행 중 / setup은 종료(정상)
docker compose logs -f --tail 100 api worker web  # 수집과 모델 호출 로그
```

브라우저에서 `http://localhost:3000`을 열고, `/admin`에서 `.env`의 `ADMIN_PASSWORD`로 로그인합니다.

1. **무엇을 생성하는가**: `docker compose`가 다섯 컨테이너를 만듭니다. `db`(PostgreSQL 17), `setup`(마이그레이션과 시드 데이터를 넣고 종료), `api`, `worker`, `web`입니다. 기본 사이트 이름은 `MyHOT`입니다.
2. **어떤 값을 전달하는가**: 첫 시작 때 `industry/sources.json`의 예시 정보원 18개(공개된 해외 AI 뉴스 RSS, T1 10개·T2 8개)가 DB에 들어갑니다. 새 정보원은 목록 앞쪽 일부(기본 최대 30건, 예시 정보원은 모두 8건으로 설정)만 가져옵니다.
3. **AIHOT이 무엇을 처리하는가**: worker가 글마다 사전 필터, 2회 채점, 구조화, 제목·요약, 사건 묶기를 돌립니다. 1–2분 뒤부터 내용이 보이기 시작하고, 첫 수집분 백여 건은 30분쯤 걸려 처리됩니다. 공식 문서 기준으로 예시 정보원 첫 수집 152건에 모델 호출이 약 930번 쓰였습니다.
4. **어떤 결과를 반환하는가**: 홈에는 선정 글, `/all`에는 전체 동향, `/hot`에는 사건 순위가 나옵니다. `/agent`에서 MCP·RSS·API 연결 방법을 복사할 수 있고, API 문서는 `/openapi-v1.json`입니다. 일간 리포트는 다음 발행 시각(기본 베이징 시간 08:00)이 지나야 생깁니다.

관리자 화면에서 먼저 볼 곳은 세 군데입니다.

- **정보원**: 각 정보원이 제대로 수집되는지, 실패 원인은 무엇인지
- **실행**: 예약 작업의 최근 결과, 결과를 모르는 영수증, 사건 묶기 대기 중인 글
- **모델과 평가**: 단계별 모델, 성공률, 소요 시간, 토큰 사용량

## Docker 없이 실행하기

Linux나 macOS에서 직접 띄울 수도 있습니다(Windows는 WSL2).

```bash
npm ci
node scripts/init-env.ts --llm-key <모델 API Key>
createdb myhot
# .env에 추가
#   DATABASE_URL=postgres://<사용자>@127.0.0.1:5432/myhot
#   API_BASE_URL=http://127.0.0.1:3001

node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web
NODE_ENV=production node --env-file=.env apps/api/src/main.ts      # 3001
NODE_ENV=production node --env-file=.env apps/worker/src/main.ts
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # 3000
```

TypeScript 파일을 빌드 없이 `node`로 바로 실행하는 구조라서 Node.js 24.11 이상이 필요합니다. 세 프로세스 모두 `NODE_ENV=production`을 붙여야 합니다. 빠뜨리면 개발 모드로 떠서 운영용 비밀값 검사를 건너뛰고, `DEV_AUTH_ROLE` 로그인 생략도 동작합니다.

---

## 설치할 때 주의할 점

- **`SITE_URL`을 실제 주소로 바꿉니다.** 서버에 올렸는데 `localhost`로 남아 있으면 RSS, 공유 이미지, MCP 안내의 링크가 모두 틀어집니다. 브라우저 주소를 따라 자동으로 바뀌지 않습니다.
- **`*_ENABLED` 스위치는 소문자 `true`만 인정합니다.** `1`이나 `TRUE`는 꺼짐으로 처리됩니다(2026년 10월 4일 변경). 직접 만든 `.env`에 `COLLECT_ENABLED`, `MODEL_CALLS_ENABLED`가 없으면 수집도 모델 호출도 하지 않습니다.
- **UI만 확인할 때는 스위치를 끕니다.** `COLLECT_ENABLED=false`, `MODEL_CALLS_ENABLED=false`로 두면 외부 호출 없이 화면만 볼 수 있습니다. 단, 관리자 화면의 "미리보기 수집"은 이 스위치와 상관없이 실제 요청을 보냅니다.
- **유료 수집 키는 필요할 때만 넣습니다.** `SOCIALDATA_API_KEY`(X), `DAJIALA_KEY`(위챗 공식계정), `JINA_API_KEY`는 요청 단위로 과금됩니다. 넣기 전에 관리자 화면 "설정 → 유료 요청 상한"부터 확인합니다.
- **`DASHSCOPE_API_KEY`만 넣으면 임베딩도 그쪽으로 갑니다.** `EMBEDDING_API_KEY` 없이 DashScope 키를 넣으면 사건 묶기가 자동으로 DashScope 임베딩을 쓰고, 그만큼 별도 과금됩니다.
- **서버 사양을 확인합니다.** 이미지 빌드 때문에 클라우드 서버는 최소 2코어·4GB 메모리를 권장합니다.
- **`docker compose down -v`는 데이터를 지웁니다.** `db`, `data`, `caddy` 볼륨이 모두 삭제됩니다. 컨테이너만 내릴 때는 `-v` 없이 씁니다.

도메인·HTTPS·업그레이드·백업은 [활용 예시 ③ 운영과 실전 프로젝트](05-usage-operations.md)에서 다룹니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 내 업계 사이트로 바꾸기 →](03-usage-industry-site.md)
