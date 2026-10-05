# Ponytail 활용 예시 ② 기존 코드 리뷰와 부채 관리

> 이미 작성된 코드를 다루는 개발자 관점에서 `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`로 지울 것을 찾고 의도적 단순화를 관리하는 방법을 다룹니다.

Ponytail은 브라우저나 서버에서 실행되는 라이브러리가 아니므로 Client/Server 구분이 맞지 않습니다. 이 문서는 대신 **"새로 쓰는 코드"가 아니라 "이미 있는 코드"를 다루는 관점**으로 봅니다. 본체 Skill이 에이전트가 코드를 쓸 때의 태도라면, 여기서 다루는 세 Skill은 이미 쓴 코드에서 덜어낼 것을 찾는 도구입니다.

## 활용할 수 있는 기능

| 명령 | 입력 | 출력 | 바꾸는 것 |
|---|---|---|---|
| `/ponytail-review` | 현재 diff | 지울 것 목록 + `net: -<N> lines possible.` | 없음 (목록만) |
| `/ponytail-audit` | 저장소 전체 | 큰 것부터 순위 매긴 목록 + `net: -<N> lines, -<M> deps possible.` | 없음 (목록만) |
| `/ponytail-debt` | `ponytail:` 주석 | 파일별 부채 장부 + 업그레이드 조건 없는 항목 표시 | 없음 (요청하면 파일로 저장) |

세 명령 모두 **정확성 버그, 보안 취약점, 성능은 범위 밖**이라고 명시합니다. 일반 코드 리뷰를 대신하는 것이 아니라, 일반 리뷰가 잘 다루지 않는 "복잡도"만 따로 보는 리뷰입니다.

---

## 예제 1. PR 올리기 전에 `/ponytail-review`

### 상황

다른 에이전트 세션에서 "회원 초대 기능"을 구현했고, PR을 올리기 전에 과잉 설계가 없는지 보고 싶습니다. diff에는 다음 코드가 포함되어 있습니다.

```ts
// src/invite/email-validator.ts (27줄 중 발췌)
export class EmailValidator {
  private readonly rules: Array<(email: string) => boolean> = [
    (e) => e.length <= 254,
    (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
    // ...로컬 파트 길이, 연속 점, 특수문자 규칙 등
  ];
  validate(email: string): boolean {
    return this.rules.every((rule) => rule(email));
  }
}
```

```ts
// src/invite/invite.service.ts (발췌)
import moment from 'moment';

function toSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface InviteRepository { save(invite: Invite): Promise<void> }
export class PrismaInviteRepository implements InviteRepository { /* ... */ }

export function formatExpiry(date: Date) {
  return moment(date).format('YYYY-MM-DD');
}
```

### 실행

```text
/ponytail-review
```

### 결과

```text
src/invite/email-validator.ts:L1-27: stdlib: 27줄 검증 클래스. 형식 검사는 기존 zod 스키마의 z.string().email() 한 줄, 실제 검증은 초대 메일 수신으로 충분.
src/invite/invite.service.ts:L1: native: moment는 format 한 번에만 사용. Intl.DateTimeFormat('sv-SE') 또는 toISOString().slice(0, 10), 의존성 0.
src/invite/invite.service.ts:L3-5: reuse: toSlug가 src/lib/slug.ts의 slugify와 같음. 삭제하고 기존 함수 import.
src/invite/invite.service.ts:L7-8: yagni: 구현체가 하나뿐인 InviteRepository 인터페이스. 두 번째 구현이 생길 때까지 클래스를 직접 사용.
net: -41 lines possible.
```

### 코드 설명

1. **한 줄에 한 건, 위치·태그·대체물 순서입니다.** "이 부분은 좀 복잡한 것 같은데 고려해 보셨나요?" 같은 문장 대신, 무엇을 지우고 무엇으로 바꾸는지만 씁니다.
2. **태그가 사다리와 대응합니다.** `delete:`(1단계, 필요 없음), `reuse:`(2단계, 이미 있음), `stdlib:`(3단계), `native:`(4단계), `yagni:`(쓰지 않는 추상화), `shrink:`(같은 로직을 더 짧게)입니다. 리뷰 결과를 보면 어느 단계를 건너뛰었는지 알 수 있습니다.
3. **`reuse:` 태그는 v4.11.0에서 추가되었습니다.** 에이전트가 가장 흔히 만드는 낭비가 "몇 파일 옆에 있는 함수를 다시 만드는 것"이라서, 이 경우를 따로 표시하도록 했습니다.
4. **고치지 않습니다.** 결과는 목록일 뿐이고, 어떤 항목을 반영할지는 사람이 정합니다. 예를 들어 이메일 검증은 회사 정책상 더 엄격해야 할 수도 있습니다.
5. **최소 검증은 지우라고 하지 않습니다.** `assert` 기반 self-check나 작은 smoke test 하나는 Ponytail이 요구하는 최소한이므로 삭제 대상에서 제외하도록 Skill에 명시되어 있습니다.

### 실제 개발에서는

> 개발자가 기능 구현을 마치면 `/ponytail-review`로 지울 것을 먼저 줄이고, 그 다음 일반 코드 리뷰(정확성·보안)를 받습니다. 순서를 이렇게 하면 일반 리뷰어는 이미 작아진 diff를 보게 됩니다. 반대로 리뷰 Skill의 결과만 보고 머지하면 정확성과 보안은 아무도 확인하지 않은 상태가 됩니다.

---

## 예제 2. 오래된 저장소에 `/ponytail-audit`

### 상황

3년 된 Express 백엔드를 이어받았습니다. 어디부터 정리할지 감을 잡고 싶습니다.

### 실행

```text
/ponytail-audit
```

### 결과 예시

```text
yagni: BaseService/BaseController 추상 계층, 상속 클래스 각 1개씩. 상속 제거하고 직접 구현. [src/core/]
native: lodash는 get/isEmpty 두 함수에만 사용. 옵셔널 체이닝과 Object.keys(o).length. [package.json, 14곳]
stdlib: utils/deepClone.ts 직접 구현. structuredClone. [src/utils/deepClone.ts]
delete: FEATURE_NEW_CHECKOUT 플래그, 2년 전부터 항상 true. 분기와 플래그 삭제. [src/config/flags.ts]
reuse: services/order/format.ts의 formatPrice가 lib/money.ts와 중복. 기존 함수 import. [src/services/order/format.ts]
net: -620 lines, -2 deps possible.
```

### 코드 설명

1. **큰 것부터 나열합니다.** 정리 작업은 보통 시간이 부족하므로, 가장 많이 줄일 수 있는 항목부터 처리할 수 있게 순위를 매깁니다.
2. **`delete:` 전에 저장소 전체를 검색하도록 되어 있습니다.** v4.11.0에서 테스트, 픽스처, 문자열·동적 참조까지 포함해 저장소 전체를 grep한 뒤에만 `delete:`를 내도록 강화되었습니다. 그래도 리플렉션이나 외부 설정 파일에서 이름으로 참조하는 경우는 놓칠 수 있으므로, 삭제 전에 테스트를 돌려야 합니다.
3. **결과는 추정입니다.** `net:` 숫자는 모델이 읽고 판단한 추정치이지 측정값이 아닙니다.

### 실제 개발에서는

감사 결과를 한 번에 반영하지 않고 항목마다 별도 브랜치·PR로 나눕니다. "lodash 제거"와 "추상 계층 제거"를 한 PR에 섞으면 문제가 생겼을 때 원인을 찾기 어렵습니다. `ultra` 강도는 이런 정리 작업에 잘 맞지만, 기능 개발 세션으로 돌아갈 때는 `full`로 되돌립니다.

---

## 예제 3. `/ponytail-debt`로 "나중에"를 관리하기

### 상황

몇 주 동안 Ponytail을 쓰면서 코드 곳곳에 의도적 단순화가 쌓였습니다.

```ts
// src/auth/rate-limit.ts
// ponytail: 프로세스 메모리 Map, 인스턴스 2대 이상이면 Redis로
const attempts = new Map<string, number>();
```

```py
# jobs/report.py
# ponytail: O(n²) 중복 제거, 행이 만 개를 넘으면 set 기반으로
```

```ts
// src/search/rank.ts
/* ponytail: 단순 키워드 일치 점수 */
```

### 실행

```text
/ponytail-debt
```

내부적으로는 다음과 비슷한 검색을 합니다(`.git`, `node_modules`, `dist`, `build` 제외).

```bash
grep -rnE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  '(#|//|/[*]) ?ponytail:' .
```

### 결과

```text
src/auth/rate-limit.ts:2, 프로세스 메모리 Map. ceiling: 단일 인스턴스. upgrade: 인스턴스 2대 이상이면 Redis.
jobs/report.py:1, O(n²) 중복 제거. ceiling: 행 수 증가 시 느려짐. upgrade: 만 행 초과 시 set 기반.
src/search/rank.ts:1, 단순 키워드 일치 점수. ceiling: (없음). upgrade: (없음). no-trigger
3 markers, 1 with no trigger.
```

### 코드 설명

1. **주석 접두어가 있어야 장부에 들어갑니다.** `#`, `//`, `/*` 뒤의 `ponytail:`만 찾으므로, 문서에서 이 규약을 설명하는 문장은 장부에 섞이지 않습니다. `/* */` 블록 주석 인식과 빌드 디렉터리 제외는 v4.11.0에서 추가되었습니다.
2. **`no-trigger`가 가장 위험한 항목입니다.** 업그레이드 조건이 없는 단순화는 언제 다시 봐야 하는지 아무도 모르므로 조용히 영구화됩니다. `rank.ts`의 주석은 "검색 품질 불만이 월 N건을 넘으면 BM25로" 같은 조건을 추가해야 합니다.
3. **파일로 남기려면 요청합니다.** 기본은 읽기 전용이고, "PONYTAIL-DEBT.md로 저장해 줘"라고 하면 장부 파일을 씁니다. 담당자가 필요하면 `git blame -L<줄>,<줄>`을 함께 쓰라고 안내합니다.

### 실제 개발에서는

> 스프린트 회고 전에 `/ponytail-debt`를 돌려, 업그레이드 조건이 충족된 항목(예: 인스턴스가 2대로 늘어난 rate-limit)을 다음 스프린트 작업으로 옮깁니다. `no-trigger` 항목은 조건을 적어 넣는 작은 작업으로 처리합니다.

---

## `/ponytail-gain`은 어디에 쓰나

`/ponytail-gain`은 공개 벤치마크의 효과를 막대그래프로 보여 주는 표시용 명령입니다. 두 가지를 알아 두어야 합니다.

- **현재 저장소의 수치가 아닙니다.** Skill 자체가 "만들지 않은 코드에는 기준선이 없으므로 저장소별 절감량을 출력하지 말라"고 정해 두었습니다. 실제 저장소에서 셀 수 있는 숫자는 `/ponytail-debt`의 장부뿐입니다.
- **표시되는 숫자는 예전 단발 벤치마크 기준입니다.** 2026년 10월 기준 Skill 본문은 "80~94% 코드 감소" 같은 단발(single-shot) 벤치마크 수치를 보여 주는데, 이 수치는 프로젝트 스스로 "대화체 기준선 때문에 부풀려진 작업별 상한"이라고 정정한 값입니다. 팀에 효과를 설명할 때는 README의 agentic 벤치마크(평균 -54%)를 인용하는 편이 정확합니다.

---

[← 활용 예시 ① 프론트엔드 기능 개발](03-usage-frontend.md) · [목차](README.md) · [활용 예시 ③ 팀·다중 에이전트 운영 →](05-usage-team-agents.md)
