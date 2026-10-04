# ECC 활용 예시 ① 기능 개발과 빌드 복구

> 결제 재시도 기능을 계획 → TDD → 리뷰 → 검증 흐름으로 만드는 과정과, 깨진 빌드를 최소 변경으로 복구하는 과정을 다룹니다.

## 예제 1. 결제 재시도 기능을 TDD로 추가하기

### 요구사항

> PG사 결제 승인 API가 일시적으로 실패(HTTP 503, 타임아웃)하면 최대 3회까지 지수 백오프로 재시도한다. 단, 같은 주문이 두 번 결제되면 안 되므로 멱등성 키를 반드시 사용한다. 카드 한도 초과 같은 영구 실패는 재시도하지 않는다.

### 구현

```text
/ecc:plan "PG 결제 승인 API 일시 실패 시 최대 3회 지수 백오프 재시도. 멱등성 키 필수. 영구 실패는 재시도 금지"
```

planner가 계획을 제시하면 확인 후 `tdd-workflow`로 진행합니다. 에이전트는 구현 전에 다음과 같은 실패하는 테스트부터 작성합니다.

```ts
// src/payments/approve-with-retry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { approveWithRetry } from './approve-with-retry';
import { PgError } from './pg-client';

describe('approveWithRetry', () => {
  it('일시 실패(503)는 최대 3회 재시도 후 성공하면 결과를 반환한다', async () => {
    const approve = vi
      .fn()
      .mockRejectedValueOnce(new PgError(503))
      .mockRejectedValueOnce(new PgError(503))
      .mockResolvedValueOnce({ status: 'APPROVED' });

    const result = await approveWithRetry({ approve, orderId: 'order-1', sleep: async () => {} });

    expect(result.status).toBe('APPROVED');
    expect(approve).toHaveBeenCalledTimes(3);
  });

  it('모든 재시도에서 같은 멱등성 키를 사용한다', async () => {
    const approve = vi.fn().mockRejectedValueOnce(new PgError(503)).mockResolvedValueOnce({ status: 'APPROVED' });

    await approveWithRetry({ approve, orderId: 'order-1', sleep: async () => {} });

    const keys = approve.mock.calls.map(([req]) => req.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('영구 실패(한도 초과)는 재시도하지 않는다', async () => {
    const approve = vi.fn().mockRejectedValue(new PgError(402, 'LIMIT_EXCEEDED'));

    await expect(approveWithRetry({ approve, orderId: 'order-1', sleep: async () => {} })).rejects.toThrow();
    expect(approve).toHaveBeenCalledTimes(1);
  });
});
```

테스트가 실패하는 것(RED)을 확인한 뒤에 구현합니다.

```ts
// src/payments/approve-with-retry.ts
import { PgError, type ApproveRequest, type ApproveResult } from './pg-client';

const RETRYABLE = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;

type Options = {
  approve: (req: ApproveRequest) => Promise<ApproveResult>;
  orderId: string;
  sleep?: (ms: number) => Promise<void>;
};

export async function approveWithRetry({
  approve,
  orderId,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}: Options): Promise<ApproveResult> {
  // 주문 단위로 고정된 키: 재시도해도 PG가 같은 요청으로 인식한다
  const idempotencyKey = `approve:${orderId}`;

  for (let attempt = 1; ; attempt++) {
    try {
      return await approve({ orderId, idempotencyKey });
    } catch (error) {
      const retryable = error instanceof PgError && RETRYABLE.has(error.status);
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;
      await sleep(200 * 2 ** (attempt - 1)); // 200ms, 400ms
    }
  }
}
```

구현이 끝나면 리뷰와 검증을 이어 갑니다.

```text
/code-review src/payments/
/security-scan
```

### 실행 흐름

```text
개발자: /ecc:plan "..."
 ↓
planner Agent: 계획 작성 → 개발자 CONFIRM
 ↓
tdd-workflow Skill: 실패하는 테스트 작성 → npm test (RED 증거)
 ↓
메인 에이전트: 구현 → npm test (GREEN)
 ↓  (파일 수정마다 PostToolUse Hook이 타입 체크)
code-reviewer Agent: 별도 컨텍스트에서 리뷰 → 지적 사항
 ↓
메인 에이전트: 지적 사항마다 회귀 테스트 추가 후 수정
 ↓
verification: build · lint · typecheck · test 전체 통과
 ↓
Stop Hook: 세션 요약 + "결제는 멱등성 키 필수" 같은 Instinct 저장
```

### 코드 설명

1. **테스트가 요구사항을 그대로 표현합니다.** "3회까지", "같은 멱등성 키", "영구 실패는 재시도 안 함"이 각각 하나의 테스트가 됩니다. 에이전트가 요구사항을 잘못 이해했다면 구현 전에 테스트를 보고 바로 알 수 있습니다.
2. **`sleep`을 주입받습니다.** 테스트에서 실제로 기다리지 않도록 하기 위한 설계로, TDD를 먼저 하면 자연스럽게 이런 테스트 가능한 구조가 나옵니다.
3. **멱등성 키를 루프 밖에서 한 번만 만듭니다.** 재시도마다 새 키를 만들면 PG 입장에서는 별개의 결제 요청이 되어 중복 결제가 생길 수 있습니다.
4. **리뷰는 별도 컨텍스트에서 합니다.** code-reviewer는 구현 과정의 대화를 모르므로 "왜 이렇게 했는지"가 아니라 "코드가 무엇을 하는지"만 보고 판단합니다.

### 왜 이렇게 사용하는가?

결제처럼 실수 비용이 큰 영역에서 에이전트에게 "알아서 재시도 로직 짜줘"라고 하면, 코드는 그럴듯하지만 멱등성 키가 매번 새로 만들어지는 식의 미묘한 버그가 섞이기 쉽습니다. ECC의 흐름은 **계획 단계에서 사람이 방향을 확인하고, 테스트로 요구사항을 고정하고, 다른 시선으로 리뷰하는 지점**을 강제합니다. 결과물이 코드 한 덩어리가 아니라 "계획 → 실패 테스트 → 통과 테스트 → 리뷰 → 검증"이라는 증거의 흐름으로 남기 때문에, 나중에 사람이 검토하기도 쉽습니다.

## 예제 2. CI가 깨졌을 때 빌드 복구

### 요구사항

> 의존성 업데이트 후 TypeScript 빌드가 수십 개의 타입 오류로 깨졌다. 설계를 바꾸지 말고 최소한의 수정으로 빌드만 복구하고 싶다.

### 구현

```text
/build-fix
```

`/build-fix`는 프로젝트의 빌드 시스템을 감지하고 build-error-resolver Agent에 넘깁니다. 이 Agent는 "아키텍처 변경 없이 최소 diff로 빌드를 초록색으로 만든다"는 역할로 범위가 제한되어 있어서, 타입 오류를 고치다가 관련 없는 리팩터링까지 하는 일을 줄입니다.

### 왜 이렇게 사용하는가?

빌드 복구와 리팩터링을 한 번에 하면 리뷰가 어려워지고 원인 추적도 힘들어집니다. 역할이 좁게 정의된 Agent를 쓰는 것은 **에이전트가 하는 일의 범위를 줄여 결과를 예측 가능하게 만드는 것**입니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 프론트엔드 개발 →](04-usage-frontend.md)
