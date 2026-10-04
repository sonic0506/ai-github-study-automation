# ECC 활용 예시 ② 프론트엔드 개발

> 개발자 한 명의 로컬 하네스에서 React·Next.js 작업에 ECC의 Skill과 Agent를 쓰는 방법을 다룹니다.

ECC는 브라우저나 앱에서 실행되는 클라이언트 라이브러리가 아니므로, 여기서는 "개발자 한 명의 로컬 환경"을 클라이언트 관점으로 봅니다. 그중에서도 프론트엔드 작업에 쓸 수 있는 구성 요소가 많습니다.

## 활용할 수 있는 기능

- **React·Next.js Skill**: `react-patterns`(훅 규칙, 서버·클라이언트 컴포넌트 경계, Suspense), `react-performance`(워터폴, 번들 크기, 리렌더 등 우선순위별 규칙), `nextjs-turbopack`, `frontend-patterns`
- **테스트 Skill**: `react-testing`(React Testing Library + Vitest/Jest, MSW, 접근성 단언), `e2e-testing`(Playwright Page Object Model)
- **접근성·디자인**: `frontend-a11y`, `accessibility`(WCAG 2.2 AA), `design-system`
- **리뷰·복구 Agent**: `react-reviewer`, `typescript-reviewer`, `react-build-resolver`(Vite, webpack, Next.js 빌드 실패, 하이드레이션 불일치), `performance-optimizer`
- **확인·공유**: `browser-qa`(배포 후 실제 화면 확인), `ui-demo`(Playwright로 데모 영상 녹화)
- **Plan Canvas**: `/plan`의 확인 단계를 로컬 브라우저 화면에서 처리하고, 화면 요소를 클릭해 번호 붙은 주석을 남길 수 있습니다.

## 실제 예제

상품 상세 페이지에 리뷰 목록을 추가하는 작업을 ECC 흐름으로 진행하면 다음과 같습니다.

```text
/ecc:plan "상품 상세 페이지에 리뷰 목록 추가. 서버 컴포넌트에서 첫 페이지 렌더, 더보기는 클라이언트에서"
```

에이전트는 `react-patterns` Skill에 따라 서버·클라이언트 경계를 나누고, `react-testing` Skill에 따라 컴포넌트 테스트를 먼저 작성합니다.

```tsx
// app/products/[id]/ReviewList.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewList } from './ReviewList';

it('더보기 버튼을 누르면 다음 페이지 리뷰를 이어서 보여준다', async () => {
  const fetchPage = vi.fn().mockResolvedValue({
    items: [{ id: 'r3', author: '민수', body: '배송이 빨라요' }],
    nextCursor: null,
  });

  render(
    <ReviewList
      initial={{ items: [{ id: 'r1', author: '지영', body: '좋아요' }], nextCursor: 'c2' }}
      fetchPage={fetchPage}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: '리뷰 더보기' }));

  expect(await screen.findByText('배송이 빨라요')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '리뷰 더보기' })).not.toBeInTheDocument();
});
```

```tsx
// app/products/[id]/ReviewList.tsx
'use client';

import { useState, useTransition } from 'react';

type Review = { id: string; author: string; body: string };
type Page = { items: Review[]; nextCursor: string | null };

export function ReviewList({
  initial,
  fetchPage,
}: {
  initial: Page;
  fetchPage: (cursor: string) => Promise<Page>;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [isPending, startTransition] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      const page = await fetchPage(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    });
  };

  return (
    <section aria-label="상품 리뷰">
      <ul>
        {items.map((r) => (
          <li key={r.id}>
            <strong>{r.author}</strong> {r.body}
          </li>
        ))}
      </ul>
      {cursor && (
        <button onClick={loadMore} disabled={isPending}>
          {isPending ? '불러오는 중…' : '리뷰 더보기'}
        </button>
      )}
    </section>
  );
}
```

구현 뒤에는 `.tsx` 변경이므로 react-reviewer와 typescript-reviewer를 각각 별도 컨텍스트에서 실행하고, 화면 확인이 필요하면 `browser-qa`로 실제 페이지를 확인합니다.

## 실제 서비스에서는

> 사용자가 상품 상세 페이지에 들어오면 서버 컴포넌트가 첫 페이지 리뷰 10개를 HTML에 포함해 바로 보여주고, "리뷰 더보기"를 누를 때만 클라이언트에서 `/api/products/:id/reviews?cursor=...`를 호출해 이어 붙입니다. 이때 ECC의 `react-patterns` Skill은 클라이언트 컴포넌트를 버튼과 목록 상태가 필요한 범위로만 좁히도록 이끌고, `frontend-a11y` Skill은 버튼 이름과 `aria-label`을 리뷰 단계에서 확인하게 합니다.

혼자 일하는 개발자에게 ECC의 가치는 "옆에 리뷰어와 QA 담당이 한 명씩 더 있는 것"에 가깝습니다. 다만 Skill이 293개이므로 프론트엔드 개발자라면 프론트엔드 관련 Skill과 TypeScript Rule만 켜는 것이 좋습니다.

---

[← 활용 예시 ① 기능 개발과 빌드 복구](03-usage-workflow.md) · [목차](README.md) · [활용 예시 ③ 팀·CI·서버 →](05-usage-team-ci.md)
