# Ponytail 활용 예시 ① 프론트엔드 기능 개발

> 관리자 화면의 상품 등록 폼과 피드 무한 스크롤을 예로, Ponytail이 라이브러리 대신 브라우저 기본 기능을 고르는 과정과 그 결과를 검토하는 방법을 다룹니다.

프론트엔드는 Ponytail의 효과가 가장 크게 나는 영역입니다. 공개된 agentic 벤치마크에서 날짜 선택기는 404줄에서 23줄로, 색상 선택기는 287줄에서 23줄로, 파일 드롭존은 251줄에서 95줄로 줄었습니다. 공통점은 **브라우저가 이미 같은 기능을 제공하는데 에이전트가 컴포넌트를 직접 만들던 작업**이라는 것입니다.

## 예제 1. 상품 등록 폼에 판매 기간·대표 색상·이미지 업로드 추가

### 요구사항

> 관리자 상품 등록 폼에 판매 시작일, 상품 대표 색상, 상품 이미지(최대 5장, 이미지 파일만) 입력을 추가한다. 등록 전에 "판매 기간이 지나면 자동으로 비공개된다"는 확인 창을 띄운다. 스택은 React + TypeScript, 서버는 기존 `POST /api/products` 를 그대로 쓴다.

### 구현

Ponytail이 켜진 Claude Code 세션에서 요청을 그대로 입력합니다.

```text
상품 등록 폼(src/admin/ProductForm.tsx)에 판매 시작일, 대표 색상, 상품 이미지(최대 5장, 이미지만) 입력을 추가하고,
등록 전에 "판매 기간이 지나면 자동 비공개" 확인 창을 띄워 줘.
```

에이전트는 먼저 `ProductForm.tsx`와 제출 함수를 읽고, 사다리를 오르며 각 요구를 다음 단계에서 멈춥니다.

| 요구 | 멈춘 단계 | 선택 |
|---|---|---|
| 판매 시작일 | 4. 네이티브 기능 | `<input type="date">` |
| 대표 색상 | 4. 네이티브 기능 | `<input type="color">` |
| 이미지 업로드 | 4. 네이티브 기능 | `<input type="file" accept="image/*" multiple>` |
| 최대 5장 제한 | 7. 최소 코드 | 개수 검사 한 줄 (HTML 속성으로는 개수 제한 불가) |
| 확인 창 | 4. 네이티브 기능 | `<dialog>` + `showModal()` |
| 폼 값 수집 | 3. 표준 API | `FormData` |

결과물은 다음과 같습니다.

```tsx
// src/admin/ProductForm.tsx
import { useRef, useState, type FormEvent } from 'react';
import { createProduct } from './api'; // 2단계: 이미 있는 API 함수 재사용

const MAX_IMAGES = 5;

export function ProductForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const images = new FormData(e.currentTarget).getAll('images') as File[];
    // 신뢰 경계는 서버지만, 사용자에게 바로 알려 주는 검사는 남긴다
    if (images.length > MAX_IMAGES) return setError(`이미지는 최대 ${MAX_IMAGES}장입니다.`);
    setError('');
    confirmRef.current?.showModal();
  }

  async function onConfirm() {
    await createProduct(new FormData(formRef.current!));
    confirmRef.current?.close();
  }

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit}>
        {/* 기존 상품명·가격 필드 생략 */}
        <label>
          판매 시작일
          <input type="date" name="saleStartsAt" min={today} required />
        </label>
        <label>
          대표 색상
          <input type="color" name="themeColor" defaultValue="#222222" />
        </label>
        <label>
          상품 이미지 (최대 {MAX_IMAGES}장)
          <input type="file" name="images" accept="image/*" multiple required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">등록</button>
      </form>

      <dialog ref={confirmRef} aria-labelledby="confirm-title">
        <h2 id="confirm-title">판매 기간이 지나면 자동으로 비공개됩니다.</h2>
        <button onClick={onConfirm}>등록</button>
        <button onClick={() => confirmRef.current?.close()}>취소</button>
      </dialog>
    </>
  );
}
```

응답 끝에는 이런 줄이 붙습니다.

```text
skipped: 날짜·색상 선택기 라이브러리, 커스텀 모달, 드래그앤드롭 업로드 영역.
add when: 디자인 시스템이 달력·팔레트 모양을 요구하거나, 드래그앤드롭이 실제 요구사항이 될 때.
```

### 실행 흐름

```text
개발자: 상품 등록 폼에 ... 추가해 줘
 ↓
SessionStart Hook이 세션 시작 때 주입한 규칙(full)이 이미 컨텍스트에 있음
 ↓
에이전트: ProductForm.tsx, api.ts 읽기 → 기존 createProduct 발견 (2단계)
 ↓
에이전트: 요구마다 사다리 → 네이티브 input·dialog 선택 (4단계)
 ↓
에이전트: 줄이지 않는 것 확인 → label, required, min, role="alert", aria-labelledby 유지
 ↓
결과: ProductForm.tsx 한 파일 수정, 새 의존성 0개 + "skipped / add when" 두 줄
```

### 코드 설명

1. **새 파일과 새 의존성이 없습니다.** 기존 폼 파일 하나만 바뀌고 `package.json`은 그대로입니다. 리뷰어는 diff 한 화면만 보면 됩니다.
2. **이미 있는 `createProduct`를 재사용합니다.** 사다리 2단계("이미 코드베이스에 있는가")입니다. 에이전트가 관련 코드를 먼저 읽어야 이 단계가 성립하므로, "이해한 다음 사다리"라는 규칙이 여기서 의미를 가집니다.
3. **HTML 속성으로 할 수 없는 것만 코드로 씁니다.** `accept="image/*"`는 파일 종류를 거르지만 개수 제한은 없으므로 `MAX_IMAGES` 검사 한 줄만 추가했습니다.
4. **접근성은 줄이지 않았습니다.** `<label>`, `role="alert"`, `aria-labelledby`는 "접근성 기본"에 해당해 규칙상 생략 대상이 아닙니다. `<dialog>`의 `showModal()`은 포커스 가두기와 Esc 닫기를 브라우저가 처리해 줍니다.
5. **브라우저 검증은 서버 검증을 대신하지 않습니다.** `accept`와 `required`는 사용자 편의를 위한 것이고, 파일 형식·개수 검증은 `POST /api/products` 쪽에도 있어야 합니다. Ponytail 규칙의 "신뢰 경계 입력 검증"은 바로 이 서버 쪽 검증을 가리킵니다.

### 왜 이렇게 사용하는가?

에이전트에게 "날짜 선택기 만들어 줘"라고 하면 에이전트는 성실하게 "좋은 날짜 선택기"를 만들려고 합니다. 문제는 그 성실함이 키보드 처리, 로캘, 타임존, 스타일까지 직접 책임지는 수백 줄로 이어진다는 것입니다. 브라우저 기본 입력은 그 책임을 플랫폼에 넘깁니다. 모양이 디자인 시스템과 완전히 같지 않다는 단점이 있지만, 그 요구가 실제로 생겼을 때 라이브러리를 추가해도 늦지 않습니다. Ponytail이 응답 끝에 "언제 추가하면 되는지"를 남기는 이유가 이것입니다.

---

## 예제 2. 피드 무한 스크롤을 `lite` 강도로 도입하기

### 요구사항

> 공지 피드에서 사용자가 목록 끝까지 스크롤하면 다음 페이지를 불러온다. 팀이 Ponytail을 처음 도입하는 중이라, 에이전트가 마음대로 방식을 바꾸지 말고 대안만 알려 줬으면 한다.

### 구현

```text
/ponytail lite
공지 피드(src/feed/Feed.tsx)에 무한 스크롤 추가해 줘. react-infinite-scroll-component 써서.
```

`lite`는 요청한 대로 만들되 더 게으른 대안을 한 줄로 알려 주는 강도입니다. 에이전트는 요청대로 라이브러리 버전을 만들고 끝에 다음과 같이 덧붙입니다.

```text
라이브러리로 구현했습니다. 참고: IntersectionObserver로 의존성 없이 15줄 정도면 됩니다. 원하시면 바꿔 드릴게요.
```

팀이 대안을 고르면 결과는 다음과 같습니다.

```tsx
// src/feed/Feed.tsx
// ponytail: IntersectionObserver 기반, 목록이 수천 개를 넘어 렌더링이 느려지면 가상 스크롤 도입
import { useEffect, useRef } from 'react';
import { NoticeCard, type Notice } from './NoticeCard';

type Props = { items: Notice[]; hasMore: boolean; fetchMore: () => void };

export function Feed({ items, hasMore, fetchMore }: Props) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || !sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fetchMore();
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, fetchMore]);

  return (
    <>
      {items.map((item) => <NoticeCard key={item.id} notice={item} />)}
      <div ref={sentinel} aria-hidden="true" />
    </>
  );
}
```

### 코드 설명

1. **감시용 빈 `div`(sentinel)가 화면에 들어오면 다음 페이지를 부릅니다.** 스크롤 이벤트를 듣고 위치를 계산하는 대신, 브라우저가 "이 요소가 보이기 시작했다"를 알려 줍니다. 스크롤 throttle도 필요 없습니다.
2. **`hasMore`가 false면 관찰을 시작하지 않습니다.** 마지막 페이지 이후 불필요한 호출을 막습니다.
3. **`ponytail:` 주석이 한계를 적어 둡니다.** 이 방식은 항목이 아주 많아지면 DOM이 커져 느려집니다. 그 시점(가상 스크롤 필요)을 주석에 남겼기 때문에, 나중에 `/ponytail-debt`로 모아 볼 수 있습니다.

### 왜 이렇게 사용하는가?

처음부터 `full`이나 `ultra`로 도입하면 "라이브러리 쓰라고 했는데 왜 바꿨냐"는 반발이 생기기 쉽습니다. `lite`는 결정권을 사람에게 남겨 두고 대안만 보여 주므로, 팀이 Ponytail의 판단을 몇 번 확인해 본 뒤 기본값 `full`로 옮겨 가는 도입 경로로 적합합니다.

---

## 검토할 때 확인할 것

Ponytail이 만든 프론트엔드 diff를 리뷰할 때는 "짧은가"보다 다음을 봅니다.

- 레이블, 키보드 조작, 오류 메시지 같은 **접근성 요소가 남아 있는가**
- 브라우저 속성만으로 검증을 끝내고 **서버 검증을 빠뜨리지 않았는가**
- 네이티브 기능의 **브라우저 지원 범위**가 서비스 대상과 맞는가(예: `field-sizing: content` 같은 최신 CSS)
- 의도적 단순화에 **`ponytail:` 주석과 업그레이드 조건**이 있는가

이 중 앞의 세 가지는 Ponytail의 리뷰 Skill 범위 밖이므로, 일반 코드 리뷰에서 확인해야 합니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 기존 코드 리뷰와 부채 관리 →](04-usage-review-debt.md)
