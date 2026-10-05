# n8n 설치와 첫 사용

> 설치 방법을 고르는 기준, 꼭 알아야 할 기본 설정, 웹훅 하나로 만드는 첫 워크플로, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

n8n을 쓰는 방법은 크게 **n8n Cloud**(가입만 하면 바로 사용)와 **셀프호스팅** 두 가지입니다. 이 문서는 셀프호스팅 기준입니다. 셀프호스팅은 Docker를 기본으로 생각하는 것이 좋습니다. 공식 문서가 Docker 계열 설치를 권장하고, n8n 3.0부터는 npm으로 실행하는 방식이 빠지고 Docker 기반 배포가 필수가 될 예정이기 때문입니다.

**방법 1. 설치 스크립트(가장 빠름, Docker 필요)**

```bash
curl -fsSL https://get.n8n.io | sh
```

스크립트는 Docker Compose 구성(`get-n8n-compose.yml`)과 `.env`를 내려받아 n8n, Code 노드용 Task Runner, n8n Assistant용 샌드박스 서비스까지 함께 띄웁니다. 샌드박스까지 포함하면 RAM 4GB, vCPU 2개 이상이 필요합니다.

**방법 2. Docker 한 줄 실행(로컬 체험용)**

```bash
docker volume create n8n_data
docker run -it --rm --name n8n -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

브라우저에서 `http://localhost:5678`을 열고 소유자 계정을 만들면 에디터가 나옵니다. 데이터는 SQLite 파일로 `n8n_data` 볼륨에 저장됩니다.

**방법 3. Docker Compose + Postgres(운영용)**

여러 사람이 쓰거나 상시 운영하는 인스턴스는 Postgres를 붙이고, Code 노드용 Task Runner를 별도 컨테이너(external mode)로 둡니다. 전체 `compose.yml`은 [셀프호스팅 운영과 실전 적용](05-usage-self-hosting-ops.md#파일-단위-구현)에서 다룹니다.

**방법 4. npm(2.x까지)**

```bash
npx n8n
# 또는
npm install -g n8n && n8n start
```

현재 2.x에서는 동작하지만, 3.0에서 실행 가능한 `n8n` 패키지를 npm에 더 이상 배포하지 않을 예정입니다. 새로 시작한다면 Docker로 가는 편이 이후 업그레이드가 쉽습니다.

**버전 선택**

n8n은 대부분 주마다 새 minor 버전을 내고, Docker 이미지 태그로 `stable`(운영용)과 `beta`(가장 최근 릴리스, 불안정할 수 있음)를 제공합니다. 2026년 10월 초 기준 `stable`은 2.41.x, `beta`는 2.42.x이며, 1.x 계열도 유지보수 릴리스가 나오고 있습니다. 운영에서는 `latest`나 `stable` 같은 움직이는 태그 대신 `2.41.6`처럼 **정확한 버전을 고정**하고, 릴리스 노트를 확인한 뒤 올립니다.

## 기본 설정

n8n 설정은 대부분 환경 변수로 합니다. 처음부터 정해 두어야 하는 것은 다음 다섯 가지입니다.

```bash
# 1) Credential 암호화 키: 정하지 않으면 첫 실행 때 자동 생성되어 /home/node/.n8n/config 에 저장된다
N8N_ENCRYPTION_KEY=<openssl rand -hex 32 로 만든 값>

# 2) 외부에서 접근하는 주소: 웹훅 URL과 OAuth 콜백 URL이 이 값으로 만들어진다
WEBHOOK_URL=https://n8n.example.com/

# 3) 시간대: Schedule Trigger와 날짜 표현식의 기준
GENERIC_TIMEZONE=Asia/Seoul
TZ=Asia/Seoul

# 4) DB: 기본은 SQLite. 운영은 Postgres
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n
DB_POSTGRESDB_PASSWORD=<비밀번호>

# 5) 실행 기록 보존: 기본 336시간(14일), 최대 10000건
EXECUTIONS_DATA_MAX_AGE=168
```

- **암호화 키**는 Credential을 복호화하는 유일한 열쇠입니다. 자동 생성된 키를 쓰더라도 `/home/node/.n8n` 볼륨과 함께 반드시 백업합니다.
- **`WEBHOOK_URL`**을 정하지 않으면 리버스 프록시 뒤에서 웹훅 URL이 `http://localhost:5678/...`로 표시되어 외부 서비스가 호출할 수 없습니다.
- **시간대**를 정하지 않으면 "매일 오전 9시" 스케줄이 UTC 기준으로 돌아 한국 시간 오후 6시에 실행됩니다.

## 가장 간단한 예제

웹훅으로 이름을 받아 인사말을 돌려주는 워크플로를 만들어 봅니다.

1. 에디터에서 **Create workflow**를 누르고 **Webhook** 노드를 추가합니다. HTTP Method는 `POST`, Path는 `hello`, Respond는 **When Last Node Finishes**로 둡니다.
2. Webhook 노드 뒤에 **Code** 노드를 연결하고 언어는 JavaScript, 모드는 기본값인 **Run Once for All Items**로 둔 채 아래 코드를 넣습니다.

```js
// Code 노드: 입력 아이템마다 인사말 필드를 추가한다
return $input.all().map((item) => {
  const name = item.json.body?.name ?? '익명';
  return {
    json: {
      greeting: `안녕하세요, ${name}님`,
      receivedAt: new Date().toISOString(),
    },
  };
});
```

3. Webhook 노드에서 **Listen for test event**를 누른 뒤 터미널에서 테스트 URL을 호출합니다.

```bash
curl -X POST http://localhost:5678/webhook-test/hello \
  -H 'Content-Type: application/json' \
  -d '{"name":"지영"}'
# {"greeting":"안녕하세요, 지영님","receivedAt":"2026-10-05T01:23:45.000Z"}
```

4. 결과가 맞으면 오른쪽 위 **Publish**를 누릅니다. 이제 `/webhook/hello`(운영 URL)로 호출할 수 있고, 실행 결과는 캔버스가 아니라 **Executions** 탭에 쌓입니다.

이 예제에서 일어난 일을 정리하면 다음과 같습니다.

1. **무엇을 생성하는가**: Webhook 노드가 `/webhook-test/hello`(테스트)와 `/webhook/hello`(운영) 두 개의 HTTP 엔드포인트를 등록합니다.
2. **어떤 값을 전달하는가**: HTTP 요청 하나가 아이템 하나가 되고, 아이템의 `json`에는 `headers`, `params`, `query`, `body`가 들어갑니다. 그래서 Code 노드에서 `item.json.body.name`으로 꺼냅니다.
3. **n8n이 무엇을 처리하는가**: 실행 엔진이 Webhook → Code 순서로 노드를 실행하고, Code 노드의 JavaScript는 Task Runner에서 격리되어 실행됩니다. 노드별 입력과 출력은 실행 기록으로 저장됩니다.
4. **어떤 결과를 반환하는가**: Respond를 **When Last Node Finishes**로 두었으므로, 마지막 노드(Code)의 첫 아이템 JSON이 HTTP 응답 본문으로 돌아갑니다.

`$input.all()`, `item.json` 같은 표현이 왜 이런 모양인지는 [핵심 개념](01-core-concepts.md#3-item-아이템)의 아이템 구조를 보면 이해할 수 있습니다.

---

## 설치할 때 주의할 점

- **볼륨 없이 실행하지 않습니다.** `-v n8n_data:/home/node/.n8n` 없이 `--rm`으로 띄우면 컨테이너를 지우는 순간 워크플로, Credential, 암호화 키가 함께 사라집니다. Postgres를 쓰더라도 이 볼륨은 유지합니다.
- **암호화 키를 바꾸지 않습니다.** 이미 Credential이 저장된 인스턴스에서 `N8N_ENCRYPTION_KEY`를 다른 값으로 바꾸면 기존 Credential을 읽을 수 없습니다. 키를 교체해야 한다면 공식 키 교체(rotate) 절차를 따릅니다.
- **테스트 URL과 운영 URL을 구분합니다.** `/webhook-test/...`는 에디터에서 대기 중일 때만 응답합니다. 외부 서비스에 테스트 URL을 등록해 두고 "가끔만 동작한다"고 착각하는 경우가 많습니다.
- **SQLite로 오래 운영하지 않습니다.** 사용자와 워크플로가 늘거나 상시 실행이 많아지면 Postgres를 권장합니다. Queue mode는 SQLite를 지원하지 않습니다. MySQL·MariaDB 지원은 2.0에서 제거되었습니다.
- **Windows에서는 WSL 파일 시스템 안에서 실행합니다.** Docker Compose 프로젝트 폴더를 `/mnt/c/...` 아래에 두면 성능과 권한 문제가 생깁니다.
- **5678 외의 포트를 외부에 열지 않습니다.** 설치 스크립트 구성의 Task Runner와 샌드박스 컨테이너(특히 privileged로 동작하는 `sandbox-runner-1`)는 내부 네트워크 전용입니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 웹훅 기반 업무 자동화 →](03-usage-webhook-automation.md)
