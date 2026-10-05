# CC Switch 활용 예시 ① 공급자 전환과 프로젝트 구성

> 구독 한도에 걸렸을 때 다른 공급자로 옮겨 작업을 이어 가는 과정과, 회사·개인 작업 환경을 프로젝트로 묶어 한 번에 바꾸는 과정을 다룹니다.

## 예제 1. 구독 한도에 걸렸을 때 Coding Plan으로 옮겨 가기

### 요구사항

> 평소에는 Claude 공식 구독으로 Claude Code를 쓴다. 5시간 한도에 가까워지면 Anthropic 형식을 지원하는 Coding Plan 공급자로 바꿔 작업을 이어 가고, 한도가 초기화되면 다시 공식 구독으로 돌아온다. 이때 `~/.claude/settings.json`에 넣어 둔 Hook과 권한 설정은 절대 사라지면 안 된다.

### 구현

**1. 공급자 두 개 준비**

- **Claude Official**: 첫 실행 때 자동으로 추가된 공식 공급자입니다. 카드의 사용량 조회에서 "공식 구독(Official Subscription)" 템플릿을 켜면 5시간·주간 남은 비율이 카드에 표시됩니다(기본은 꺼져 있음).
- **Coding Plan 공급자**: 공급자 추가 → 프리셋 검색(예: Kimi, GLM, MiniMax 등 Anthropic 호환 엔드포인트를 제공하는 Coding Plan) → 키 입력. 같은 방식으로 사용량 조회를 켜면 Coding Plan의 5시간·주간·월간 한도가 카드에 나옵니다.

**2. 전환 전후로 내 설정이 보존되는지 확인하는 스크립트**

CC Switch를 처음 도입할 때는 "정말 내 Hook이 남아 있는가"를 한 번 눈으로 확인해 두는 것이 좋습니다. 아래 스크립트는 전환 전 스냅샷을 찍고, 사용자가 앱에서 전환한 뒤 Enter를 누르면 무엇이 바뀌었는지 보여 줍니다.

```ts
// scripts/check-switch.ts
// 실행: npx tsx scripts/check-switch.ts
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

type Json = Record<string, unknown>;
const SETTINGS = join(homedir(), '.claude', 'settings.json');

const read = (): Json => JSON.parse(readFileSync(SETTINGS, 'utf8'));

// 공급자가 소유하는 값: env 안의 ANTHROPIC_* 와 최상위 model
const isKeyField = (path: string) => /^env\.ANTHROPIC_/.test(path) || path === 'model';

// 중첩 객체를 "a.b.c" 경로로 펼친다 (배열은 통째로 비교)
function flatten(obj: Json, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [p, val] of flatten(v as Json, path)) out.set(p, val);
    } else {
      out.set(path, JSON.stringify(v));
    }
  }
  return out;
}

const mask = (v?: string) => (v && v.length > 12 ? `${v.slice(0, 7)}...` : v ?? '(없음)');

const before = flatten(read());
const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('CC Switch에서 공급자를 전환한 뒤 Enter를 누르세요...');
rl.close();
const after = flatten(read());

const paths = new Set([...before.keys(), ...after.keys()]);
const changed = [...paths].filter((p) => before.get(p) !== after.get(p));

const keyChanges = changed.filter(isKeyField);
const otherChanges = changed.filter((p) => !isKeyField(p));

console.log('\n[핵심 필드 변경]');
for (const p of keyChanges) console.log(`  ${p}: ${mask(before.get(p))} -> ${mask(after.get(p))}`);

console.log('\n[그 밖의 변경]');
if (otherChanges.length === 0) console.log('  없음 (Hook, 권한, 플러그인이 그대로 보존됨)');
for (const p of otherChanges) console.log(`  ${p}`);
```

**3. 한도가 다가오면 트레이에서 전환**

메뉴 막대(Windows는 작업 표시줄)의 트레이 아이콘을 열면 도구별로 "이름 · 모드 · 공급자 · 남은 할당량"이 한 줄씩 보입니다(4.0). Claude Code 하위 메뉴에서 Coding Plan 공급자를 클릭하면 전환됩니다. Claude Code는 재시작 없이 다음 요청부터 새 공급자로 갑니다.

### 실행 흐름

```text
개발자: Claude Code로 작업 중, 트레이에서 "5시간 남은 8%" 확인
 ↓
트레이: Claude Code 하위 메뉴에서 Coding Plan 공급자 클릭
 ↓
CC Switch: 앱별 잠금 → DB에서 공급자 읽기 → 쓰기 엔진이 settings.json 핵심 필드만 교체
 ↓      (파싱 실패 시 중단, 외부 변경 감지 시 다시 계산, 0600 권한으로 기록)
Claude Code: 다음 요청부터 ANTHROPIC_BASE_URL의 새 주소로 전송
 ↓
사용량 대시보드: 세션 로그에서 공급자·모델별 토큰과 추정 비용 집계
 ↓
한도 초기화 후: 트레이에서 Claude Official 클릭 → 핵심 필드 제거, 공식 로그인으로 복귀
```

### 코드 설명

1. **"핵심 필드"를 코드로 정의합니다.** `env.ANTHROPIC_*`와 최상위 `model`만 공급자가 바꿀 수 있는 값으로 보고, 나머지 변경은 따로 출력합니다. 4.0에서는 "그 밖의 변경"이 비어 있어야 정상입니다. 단, Bedrock·Vertex 공급자는 `CLAUDE_CODE_USE_BEDROCK` 같은 선택자와 `AWS_*` 값도 핵심 필드로 다루고, "Disable Artifact Tool" 같은 공급자 전용 호환 옵션도 함께 바뀌므로, 그런 공급자를 쓴다면 `isKeyField`를 넓혀야 합니다.
2. **경로 단위로 비교합니다.** `hooks.PreToolUse`, `permissions.deny`처럼 중첩된 설정도 경로로 펼쳐 비교하므로, 어느 설정이 바뀌었는지 정확히 보입니다.
3. **키는 가려서 출력합니다.** 화면 공유나 로그에 키가 남지 않도록 앞부분만 보여 줍니다.
4. **실제 전환은 앱이 합니다.** 스크립트는 읽기만 하고 아무것도 쓰지 않습니다. 설정 파일을 두 주체가 동시에 쓰는 상황을 만들지 않기 위해서입니다.

### 왜 이렇게 사용하는가?

한도 때문에 공급자를 옮기는 일은 하루에도 몇 번씩 일어나고, 대개 작업 흐름 중간에 일어납니다. 이때 설정 파일을 열어 주소와 키를 바꾸는 것은 귀찮을 뿐 아니라 실수하기 쉽습니다. 트레이에서 남은 할당량을 보고 클릭 한 번으로 옮기면 **작업 맥락을 끊지 않고** 공급자만 바꿀 수 있습니다. 그리고 4.0의 핵심 필드 교체 덕분에 "전환할 때마다 내 Hook이 무사한가"를 걱정하지 않아도 됩니다. 도입 초기에 위 스크립트로 한 번 확인해 두면 이후에는 믿고 쓸 수 있습니다.

다만 Claude Code 안에서 `/model`로 바꾼 모델은 핵심 필드이므로, 다른 공급자로 갔다가 돌아오면 공급자에 저장된 모델로 돌아갑니다. 자주 쓰는 모델은 공급자 편집 화면에 저장해 둡니다.

---

## 예제 2. 회사·개인 작업 환경을 프로젝트로 묶기

### 요구사항

> 회사 저장소에서 일할 때는 사내 게이트웨이 공급자, 사내 Jira·DB 조회용 MCP 서버, 회사 코딩 규칙 프롬프트를 써야 한다. 개인 프로젝트에서는 개인 구독, 브라우저 자동화 MCP, 개인 프롬프트를 쓴다. 회사 MCP가 개인 작업에 섞이면 안 된다.

### 구현

1. **회사 구성 만들기**: Claude Code 페이지에서 공급자를 "사내 게이트웨이"로 전환하고, MCP 화면에서 사내 MCP 서버만 Claude Code에 켜고, 프롬프트 화면에서 "회사 규칙" 프롬프트를 활성화합니다(내용은 `~/.claude/CLAUDE.md`에 기록됨).
2. **프로젝트로 저장**: 메인 화면 상단의 프로젝트 전환기에서 "새 프로젝트"를 눌러 `company`로 저장합니다.
3. **개인 구성 만들기**: 공급자를 개인 구독으로, MCP를 개인용으로, 프롬프트를 "개인 규칙"으로 바꾼 뒤 `personal`로 저장합니다.
4. **전환**: 이후에는 프로젝트 전환기나 트레이의 앱 하위 메뉴에서 `company`·`personal`을 고르면 공급자·MCP·Skills·프롬프트가 한 번에 바뀝니다.

프롬프트 라이브러리에 넣을 회사 규칙의 예입니다.

```md
<!-- 프롬프트 라이브러리: "회사 규칙" (활성화하면 ~/.claude/CLAUDE.md에 기록됨) -->
# 회사 저장소 작업 규칙

- 모든 변경은 `feature/*` 브랜치에서 하고, main에 직접 커밋하지 않는다.
- 사내 DB MCP는 읽기 전용 계정으로만 연결되어 있다. 쓰기 쿼리를 시도하지 않는다.
- 고객 식별 정보(이메일, 전화번호)는 로그나 테스트 데이터에 넣지 않는다.
- 코드 주석과 커밋 메시지는 한국어로 쓴다.
```

### 왜 이렇게 사용하는가?

공급자만 바꾸고 MCP를 그대로 두면, 개인 구독으로 일하는 세션에서 사내 DB MCP가 켜져 있는 상황이 생길 수 있습니다. 프로젝트는 **"어떤 계정으로, 어떤 도구에 접근하고, 어떤 규칙을 따르는가"를 하나의 묶음으로 관리**해서 이런 섞임을 막습니다. 다른 프로젝트로 넘어갈 때 현재 상태가 이전 프로젝트에 자동으로 저장되므로, 작업 중에 MCP 하나를 추가했다면 그 변경도 해당 프로젝트에 남습니다.

주의할 점은 프로젝트가 **전역 설정**을 바꾼다는 것입니다. `~/.claude/CLAUDE.md`와 `~/.claude/settings.json`은 모든 저장소에 적용되므로, 회사 프로젝트를 켜 둔 채 개인 저장소를 열면 회사 규칙이 적용됩니다. 저장소마다 규칙이 달라야 한다면 각 저장소의 `.claude/` 아래 프로젝트 범위 설정을 함께 쓰는 편이 정확합니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 다른 회사 모델을 도구 안에서 쓰기 →](04-usage-cross-model-routing.md)
