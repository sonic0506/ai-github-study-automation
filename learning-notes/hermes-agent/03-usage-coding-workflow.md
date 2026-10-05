# Hermes Agent 활용 예시 ① 터미널 코딩 에이전트

> 저장소에서 Hermes에게 버그 수정을 맡기는 과정과, 그 과정에서 알아낸 절차를 프로젝트 Skill로 남겨 다음 작업에 재사용하는 방법을 다룹니다.

## 예제 1. 탈퇴한 사용자가 로그인되는 버그 고치기

### 요구사항

> FastAPI로 만든 회원 API가 있다. 회원 탈퇴는 `deleted_at`을 채우는 soft delete로 처리하는데, 탈퇴한 사용자가 기존 비밀번호로 다시 로그인된다는 신고가 들어왔다. 회귀 테스트를 먼저 추가하고, 최소 변경으로 고치고 싶다. 테스트는 Docker 안에서 돌리고, 호스트 파일 시스템은 건드리지 않게 하고 싶다.

### 구현

**1단계. 프로젝트 규칙 파일 준비**

Hermes는 작업 디렉터리의 `AGENTS.md`를 시스템 프롬프트에 넣습니다(같은 위치에 `.hermes.md`가 있으면 그것이 우선이고, 없으면 `CLAUDE.md`, `.cursorrules` 순서로 찾습니다). 팀이 이미 Claude Code용 `CLAUDE.md`를 쓰고 있다면 그대로 읽힙니다.

```markdown
<!-- AGENTS.md -->
# member-api

- Python 3.12, FastAPI, SQLAlchemy 2.x, PostgreSQL 16
- 테스트: `docker compose run --rm api pytest -q`
- 버그 수정은 실패하는 테스트를 먼저 추가하고, 실패를 확인한 뒤 고친다.
- `app/auth/` 변경은 기존 공개 함수 시그니처를 바꾸지 않는다.
- 마이그레이션 파일을 직접 수정하지 않는다. 필요하면 새 리비전을 만든다.
```

**2단계. 터미널 백엔드를 Docker로, 작업은 별도 worktree에서**

```bash
cd ~/code/member-api
hermes config set terminal.backend docker   # 셸 명령을 지속형 샌드박스 컨테이너에서 실행
hermes --tui -w                              # 격리된 git worktree에서 세션 시작
```

**3단계. 계획부터 받기**

```text
/plan 탈퇴(soft delete)한 사용자가 로그인되는 버그 수정. 회귀 테스트 먼저.
```

`/plan`은 코드를 바꾸지 않고 구현 계획만 Markdown으로 써서 `.hermes/plans/` 아래에 저장합니다. 계획을 읽고 방향이 맞으면 "계획대로 진행해"라고 이어 갑니다.

**4단계. 에이전트가 작성하는 테스트와 수정**

에이전트는 `AGENTS.md`의 규칙에 따라 먼저 실패하는 테스트를 추가합니다.

```python
# tests/test_login_deleted_user.py
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from tests.factories import create_user


def test_soft_deleted_user_cannot_login(db_session):
    user = create_user(db_session, email="bye@example.com", password="pw-1234")
    user.deleted_at = datetime.now(timezone.utc)
    db_session.commit()

    client = TestClient(app)
    res = client.post("/auth/login", json={"email": "bye@example.com", "password": "pw-1234"})

    assert res.status_code == 401
    assert res.json()["detail"] == "invalid_credentials"
```

`docker compose run --rm api pytest -q tests/test_login_deleted_user.py`로 실패(200 반환)를 확인한 다음 원인을 찾습니다. 원인은 사용자 조회 쿼리가 `deleted_at`을 보지 않는 것이었습니다.

```python
# app/auth/repository.py
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User


def find_active_user_by_email(db: Session, email: str) -> User | None:
    # 탈퇴(soft delete)한 사용자는 인증 대상에서 제외한다
    stmt = select(User).where(User.email == email, User.deleted_at.is_(None))
    return db.scalars(stmt).first()
```

로그인 서비스가 이 함수를 쓰도록 바꾸고, 응답은 "없는 사용자"와 같은 `invalid_credentials`로 맞춥니다. 탈퇴 여부를 따로 알려 주면 이메일 존재 여부가 노출되기 때문입니다.

### 실행 흐름

```text
개발자: hermes --tui -w  →  /plan "..."
 ↓
AIAgent: AGENTS.md + Skill 목록 + 메모리 스냅샷으로 시스템 프롬프트 구성
 ↓
search_files / read_file 로 로그인 경로 추적 → 계획 작성 (.hermes/plans/)
 ↓
개발자: "계획대로 진행해"
 ↓
write_file 로 테스트 추가 → terminal(Docker 샌드박스)에서 pytest → 실패 확인
 ↓
patch 로 repository 수정 → pytest 전체 통과
 ↓
최종 보고 (바뀐 파일, 검증한 것, 남은 것)
 ↓
Background Review: "이 저장소의 테스트 명령, soft delete 조회 규칙" 같은 사실·절차 저장 검토
```

### 코드 설명

1. **테스트가 버그 신고를 그대로 옮깁니다.** "탈퇴 → 같은 비밀번호로 로그인 → 401"이 한 테스트입니다. 에이전트가 원인을 잘못 짚었다면 이 테스트가 통과하지 않으므로 바로 드러납니다.
2. **조회 함수 이름이 의도를 드러냅니다.** `find_active_user_by_email`처럼 "활성 사용자만"을 이름에 담으면, 다음에 다른 기능에서 같은 실수를 하기 어렵습니다.
3. **오류 응답을 일부러 구분하지 않습니다.** 탈퇴한 계정과 없는 계정을 같은 응답으로 처리하는 것은 보안상의 선택입니다. 이런 판단은 에이전트가 놓치기 쉬우므로 계획 단계에서 확인합니다.
4. **명령은 Docker 샌드박스에서 돌아갑니다.** `terminal.backend: docker`에서는 셸 명령이 하나의 지속형 컨테이너에서 실행되므로, 에이전트가 의존성을 설치하거나 파일을 만들어도 호스트 환경이 오염되지 않습니다.

### 왜 이렇게 사용하는가?

Hermes는 Claude Code처럼 코딩 전용으로 다듬어진 하네스가 아니라 범용 상주 에이전트입니다. 그래서 **절차는 프로젝트 규칙 파일과 `/plan`으로, 안전은 터미널 백엔드와 worktree로** 직접 잡아 주는 편이 결과가 안정적입니다. 대신 이렇게 일한 경험이 다음 예제처럼 Skill로 쌓이고, 같은 에이전트를 Telegram이나 크론에서도 부를 수 있다는 점이 다릅니다.

---

## 예제 2. 알아낸 절차를 프로젝트 Skill로 남기기

### 요구사항

> 이 저장소에서는 "인증 관련 버그 수정"이 자주 반복된다. 매번 테스트 명령, 팩토리 사용법, 응답 규칙을 다시 알려 주지 않도록 절차를 저장해 두고, 팀원 누구의 Hermes에서도 같은 절차가 쓰이게 하고 싶다.

### 구현

방금 한 작업을 Skill로 만들라고 요청합니다.

```text
/learn 방금 한 탈퇴 사용자 로그인 버그 수정 절차를 이 저장소의 인증 버그 수정 Skill로 만들어 줘
```

에이전트가 만든 Skill은 기본적으로 개인 Skill 디렉터리(`~/.hermes/skills/`)에 저장됩니다. 팀과 공유하려면 저장소의 `.hermes/skills/`로 옮겨 커밋합니다.

```text
member-api/
├── AGENTS.md
└── .hermes/
    └── skills/
        └── auth-bugfix/
            └── SKILL.md
```

```markdown
---
name: auth-bugfix
description: member-api 인증·로그인 버그를 회귀 테스트 우선으로 수정
---

# Auth Bugfix (member-api)

## When to Use
`app/auth/` 의 로그인, 토큰, 계정 상태 관련 버그를 고칠 때.

## Procedure
1. `tests/factories.py` 의 `create_user` 로 재현 데이터를 만든다.
2. `tests/test_<버그요약>.py` 에 실패하는 테스트를 추가하고
   `docker compose run --rm api pytest -q <파일>` 로 실패를 확인한다.
3. 사용자 조회는 `find_active_user_by_email` 같은 활성 사용자 전용 함수를 쓴다.
4. 수정 후 `docker compose run --rm api pytest -q` 전체를 돌린다.

## Pitfalls
- 인증 실패 응답은 원인과 관계없이 `invalid_credentials` 하나로 통일한다 — 원인을 구분하면 계정 존재 여부가 노출된다.
- 조회 쿼리를 새로 쓸 때 `deleted_at.is_(None)` 조건을 빠뜨리지 않는다 — soft delete 계정이 인증 경로에 다시 들어온다.

## Verification
새 테스트와 기존 `tests/auth/` 전체가 통과하고, 공개 함수 시그니처 변경이 없다.
```

팀원은 처음 한 번 이 저장소를 신뢰한다고 표시해야 Skill이 로드됩니다.

```bash
hermes skills trust          # 현재 저장소의 프로젝트 Skill 활성화
```

다음부터는 이렇게 시작합니다.

```text
/auth-bugfix 비밀번호 재설정 토큰이 만료 후에도 사용되는 문제
```

### 왜 이렇게 사용하는가?

- **신뢰는 명시적으로**: Skill은 에이전트가 따르는 절차 문서이므로, 아무 저장소나 클론했다고 자동으로 로드되면 위험합니다. 그래서 Hermes는 `hermes skills trust`를 요구하고, 신뢰한 뒤에도 `git pull`로 바뀐 Skill을 보안 검사해 위험 판정이면 격리합니다.
- **저장소 Skill이 우선**: 같은 이름이면 프로젝트 Skill이 개인·기본 Skill보다 우선하므로, 이 저장소 안에서만 다른 절차를 쓰게 할 수 있습니다. 자동 정리 기능(Curator)도 저장소 Skill은 건드리지 않습니다.
- **`AGENTS.md`와 역할 분담**: 항상 지켜야 하는 짧은 규칙은 `AGENTS.md`, 특정 작업의 긴 절차는 Skill에 둡니다. Skill이 `AGENTS.md` 내용을 반복하지 않게 하는 것도 Hermes 공식 작성 지침입니다.

---

## 함께 알아 두면 좋은 기능

| 기능 | 쓰는 상황 |
|---|---|
| `delegate_task` | 독립적인 하위 작업(예: 프런트·백엔드 분석)을 별도 컨텍스트의 하위 에이전트로 병렬 처리. 기본 최대 10개 동시 실행, 부모에게는 요약만 돌아옴 |
| `execute_code` | 도구 호출이 3번 이상 이어지고 중간 처리가 필요할 때, 에이전트가 Python 스크립트로 도구를 RPC 호출해 결과만 받음. 중간 결과가 컨텍스트에 쌓이지 않음 |
| `hermes -w` | 여러 Hermes 세션이 같은 저장소에서 서로의 작업을 덮어쓰지 않게 worktree 분리 |
| `hermes acp` | VS Code, Zed, JetBrains에서 ACP 프로토콜로 Hermes를 에디터 내장 에이전트로 사용 |

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 메신저와 예약 작업 →](04-usage-messaging-cron.md)
