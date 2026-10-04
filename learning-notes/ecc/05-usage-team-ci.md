# ECC 활용 예시 ③ 팀·CI·서버

> 팀 저장소, CI, 사내 LLM 게이트웨이와 ECC를 연결하는 방법과, 작은 서비스에 실제로 도입하는 과정을 다룹니다.

## 팀·CI·서버 환경에서의 활용

ECC는 서버 런타임에서 import하는 라이브러리가 아닙니다. 대신 **서버 코드를 개발하는 과정**과 **팀 단위 운영**에서 다음과 같이 쓰입니다.

### 활용 사례

- **팀 표준 공유**: 프로젝트 로컬 범위(`.claude/`)에 Rule과 필요한 Skill을 설치하고 저장소에 커밋해서, 팀원 모두의 에이전트가 같은 규칙으로 일하게 합니다.
- **백엔드 프레임워크별 워크플로**: `springboot-tdd`, `django-tdd`, `laravel-tdd`, `quarkus-tdd` 같은 프레임워크별 TDD·보안·검증 Skill과 `java-reviewer`, `python-reviewer`, `go-reviewer`, `database-reviewer` Agent를 사용합니다.
- **에이전트 설정 보안 감사**: CI에서 AgentShield로 저장소의 에이전트 설정(Hook, MCP 설정, 권한, 비밀값)을 검사합니다.
- **자체 호스팅 모델·게이트웨이 연결**: ECC는 Anthropic 전송 설정을 하드코딩하지 않으므로, 회사 LLM 게이트웨이나 자체 호스팅 모델을 붙여도 워크플로는 그대로 동작합니다.
- **하네스 간 인계**: Memory Vault로 Claude Code에서 하던 작업 맥락을 Codex 세션으로 넘깁니다.

### 애플리케이션 구조

ECC가 "서버 코드의 어느 계층에 들어가느냐"가 아니라, **서버 개발 흐름의 어느 단계에 개입하느냐**로 보는 것이 맞습니다.

```text
개발자 / 에이전트
 ↓
ECC Rule (항상: 코딩 표준, 보안 기본 수칙)
 ↓
ECC Skill (작업별: springboot-tdd, api-design, database-migrations)
 ↓
ECC Agent (단계별: planner → tdd-guide → java-reviewer → security-reviewer)
 ↓
ECC Hook (도구 실행마다: 위험 명령 차단, 편집 후 검사)
 ↓
저장소 코드 (Controller / Service / Repository)
 ↓
CI (테스트 + AgentShield 스캔)
```

### 실제 코드

**팀 저장소에 ECC 구성을 프로젝트 범위로 고정하기**

```bash
# 프로젝트 범위로 플러그인 설치 (설정이 저장소의 .claude/ 에 기록됨)
npx ecc-universal@2.2.3 install --guided \
  --harness claude --claude-scope project --claude-hooks standard \
  --profile core --yes

# 팀이 쓰는 언어 규칙만 프로젝트에 설치
mkdir -p .claude/rules/ecc
cp -R ECC/rules/common ECC/rules/java .claude/rules/ecc/

git add .claude
git commit -m "chore: ECC 프로젝트 범위 설정 추가"
```

**사내 LLM 게이트웨이를 쓰는 경우**

```bash
# 모델 연결은 하네스(Claude Code) 설정에서 처리하고, ECC는 건드리지 않는다
export ANTHROPIC_BASE_URL=https://llm-gateway.internal.example.com
export ANTHROPIC_AUTH_TOKEN="$GATEWAY_TOKEN"
claude
```

**CI에서 에이전트 설정 스캔하기**

```yaml
# .github/workflows/agent-config-scan.yml
name: agent-config-scan
on: [pull_request]

jobs:
  agentshield:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      # 버전을 고정하고, 고정한 버전의 릴리스 소스는 직접 검토한다
      - run: npx --yes ecc-agentshield@<검토한-버전> scan --path .
```

**계층별로 어떤 ECC 구성 요소가 어울리는가**

| 위치 | 적절한 ECC 구성 요소 | 이유 |
|---|---|---|
| Controller / API 설계 | `api-design` Skill, architect Agent | 엔드포인트 계약과 오류 응답 형식은 구현 전에 정해야 하므로 계획 단계에서 사용 |
| Service (비즈니스 로직) | `tdd-workflow` 또는 프레임워크별 TDD Skill | 규칙이 가장 많이 바뀌는 곳이라 테스트로 요구사항을 고정하는 효과가 큼 |
| Repository / DB | `database-migrations` Skill, database-reviewer Agent | 마이그레이션과 쿼리는 되돌리기 어려우므로 전용 리뷰를 거침 |
| 외부 API Adapter | security-reviewer Agent, GateGuard | 비밀값 노출과 위험 명령 실행을 모델 밖에서 막아야 함 |

---

## 실전 프로젝트 적용: 운동 클래스 예약 서비스

### 요구사항

세 명이 개발하는 "동네 운동 클래스 예약 서비스"에 ECC를 도입합니다.

- 스택: Next.js(프론트) + NestJS(API) + PostgreSQL, TypeScript 모노레포
- 팀원 두 명은 Claude Code, 한 명은 Codex를 사용
- 예약·결제 코드는 반드시 TDD와 보안 리뷰를 거친다
- 운영 DB 접속 명령과 강제 푸시는 에이전트가 실행할 수 없다
- 다음 세션이나 다른 팀원의 에이전트가 진행 상황을 이어받을 수 있어야 한다

### 전체 구조

```mermaid
flowchart LR
    subgraph Dev[개발자 환경]
        C1[Claude Code<br/>ecc@ecc 플러그인]
        C2[Codex<br/>ecc@ecc 플러그인]
    end

    subgraph Repo[모노레포]
        RULES[.claude/rules/ecc<br/>common + typescript]
        SK[.claude/skills<br/>booking-tdd]
        HK[.claude/hooks<br/>block-prod-db.js]
        MEM[.ecc/memory<br/>프로젝트 기억]
        CODE[apps/web · apps/api]
    end

    CI[GitHub Actions<br/>test + AgentShield]

    C1 --> RULES
    C1 --> SK
    C1 --> HK
    C1 <--> MEM
    C2 <--> MEM
    C1 --> CODE
    C2 --> CODE
    CODE --> CI
    RULES --> CI
```

### 폴더 구조

```text
class-booking/
├── .claude/
│   ├── settings.json             # 프로젝트 범위 플러그인 + 커스텀 Hook 등록
│   ├── rules/ecc/
│   │   ├── common/               # ECC 공통 규칙
│   │   └── typescript/           # ECC TypeScript 규칙
│   ├── skills/
│   │   └── booking-tdd/
│   │       └── SKILL.md          # 팀 전용 Skill: 예약 도메인 TDD 절차
│   └── hooks/
│       └── block-prod-db.js      # 팀 전용 Hook: 운영 DB 접속 차단
├── .ecc/
│   └── memory/                   # 하네스 간 공유 기억 (Claude ↔ Codex)
├── .github/workflows/
│   └── ci.yml
├── apps/
│   ├── web/                      # Next.js
│   └── api/                      # NestJS
└── package.json
```

### 구현

**1. 팀 전용 Skill: 예약 도메인 TDD**

ECC의 범용 `tdd-workflow`에 예약 도메인 특유의 경계 조건을 더한 Skill입니다.

```md
<!-- .claude/skills/booking-tdd/SKILL.md -->
---
name: booking-tdd
description: 클래스 예약·취소·대기열·결제 관련 코드를 추가하거나 수정할 때 사용. apps/api/src/booking/** 변경 시 적용.
---

# Booking TDD

ECC tdd-workflow 절차(RED → GREEN → REFACTOR)를 따르되, 아래 경계 조건 테스트를 반드시 포함한다.

## 필수 테스트 케이스
- 정원이 꽉 찬 클래스에 예약하면 대기열에 들어간다
- 동시에 마지막 자리 예약 요청 2건이 오면 1건만 성공한다
- 클래스 시작 24시간 이내 취소는 환불 금액이 50%다
- 같은 사용자가 같은 클래스를 중복 예약할 수 없다

## 완료 조건
- `pnpm --filter api test` 통과
- `pnpm --filter api typecheck` 통과
- 동시성 테스트는 실제 PostgreSQL(테스트 컨테이너)에서 실행
```

**2. 팀 전용 Hook: 운영 DB 접속 차단**

ECC의 GateGuard가 일반적인 파괴적 명령을 막고, 팀 고유의 위험(운영 DB)은 직접 작성한 Hook으로 막습니다.

```js
// .claude/hooks/block-prod-db.js
let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const command = JSON.parse(input).tool_input?.command ?? '';
  const touchesProd = /(psql|pg_dump|prisma\s+migrate\s+deploy).*(prod|PROD_DATABASE_URL)/.test(command);

  if (touchesProd) {
    console.error('운영 DB 관련 명령은 사람이 직접 실행합니다. 스테이징에서 먼저 확인하세요.');
    process.exit(2);
  }
  process.exit(0);
});
```

```json
// .claude/settings.json
{
  "enabledPlugins": { "ecc@ecc": true },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node .claude/hooks/block-prod-db.js" }]
      }
    ]
  }
}
```

**3. 하네스 간 공유 기억 초기화**

```bash
npm install -g ecc-universal@2.2.3
ecc memory init --scope project   # .ecc/memory/ 생성
```

**4. CI**

```yaml
# .github/workflows/ci.yml
name: ci
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test

  agent-config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx --yes ecc-agentshield@<검토한-버전> scan --path .
```

### 실제 실행 흐름

"마지막 자리 동시 예약 버그 수정" 작업을 예로 듭니다.

1. **사용자 행동**: 개발자 A가 Claude Code에서 `/ecc:plan "마지막 자리에 동시 예약 2건이 모두 성공하는 버그 수정"`을 입력합니다.
2. **하네스 처리(세션 시작)**: `SessionStart` Hook이 `.ecc/memory`와 Instinct에서 "예약 테이블은 `SELECT ... FOR UPDATE`로 잠근다"는 이전 기록을 찾아 컨텍스트에 넣습니다. TypeScript Rule도 로드됩니다.
3. **계획**: planner Agent가 원인 가설(트랜잭션 격리 수준, 잠금 누락)과 수정 계획을 제시하고, A가 확인합니다.
4. **Skill 로드**: 작업 대상이 `apps/api/src/booking/`이므로 `booking-tdd` Skill이 로드됩니다. 에이전트는 "동시 요청 2건 중 1건만 성공" 테스트를 먼저 작성하고, 실제 PostgreSQL에서 실패하는 것(RED)을 확인합니다.
5. **구현과 Hook 동작**: 에이전트가 마이그레이션 상태를 확인하려고 운영 DB에 `psql`을 실행하려 하자 `block-prod-db.js`가 차단하고, 에이전트는 메시지에 따라 스테이징 DB로 방향을 바꿉니다. 파일 수정마다 ECC의 편집 후 Hook이 타입 체크를 돌립니다.
6. **리뷰와 검증**: `/code-review`로 typescript-reviewer와 database-reviewer가 별도 컨텍스트에서 잠금 범위와 데드락 가능성을 검토합니다. 지적 사항은 회귀 테스트와 함께 반영합니다.
7. **결과 반영과 인계**: PR이 올라가면 CI가 테스트와 AgentShield 스캔을 실행합니다. 세션 종료 시 `/save-session`과 메모리 저장으로 "동시성 테스트는 테스트 컨테이너에서만 재현됨"이 기록되고, 다음 날 Codex를 쓰는 개발자 B가 `ecc memory search "동시 예약"`으로 그 맥락을 이어받습니다.

---

[← 활용 예시 ② 프론트엔드 개발](04-usage-frontend.md) · [목차](README.md) · [장단점과 대안 비교 →](06-comparison.md)
