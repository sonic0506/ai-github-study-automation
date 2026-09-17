---
name: daily-report-writer
description: github-star-analyzer의 Ranking과 study-candidate-selector의 Study Queue를 고정 Markdown 템플릿(Daily Report, Telegram 요약)으로 변환한다. AI GitHub 일일 리포트를 작성할 때 사용한다. 숫자를 새로 계산하거나 순위를 바꾸지 않는다.
---

# daily-report-writer

> 상태: **골격(Phase 2)**

## 입력
- `date`, `rankings`, `studyQueue` (JSON)

## 템플릿
- `resources/daily-report.md` — `reports/daily/{date}.md`
- `resources/telegram-daily.md` — Telegram 요약

## 규칙
- 표의 순위·숫자는 입력 JSON 값을 그대로 옮긴다. 재계산·반올림 금지 (천 단위 구분 기호만 허용).
- `delta24h=null`은 `NEW`로 표기한다.
- 한 줄 코멘트는 Repository `description` 범위 안에서만 작성한다.
- 출력: `{ "path": "reports/daily/{date}.md", "markdown": "..." }` (DailyBundle.dailyReport)
