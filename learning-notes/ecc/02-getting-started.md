# ECC 설치와 첫 사용

> 설치 방법을 고르는 기준, 기본 설정, 가장 간단한 첫 실행, 설치할 때 자주 겪는 충돌을 다룹니다.

## 설치

필요 조건은 Node.js 18 이상, Git, Claude Code 2.1 이상입니다.

**방법 1. 안내형 설치(권장)**

```bash
npx ecc-universal@2.2.3 setup
```

```bash
pnpm dlx ecc-universal@2.2.3 setup
```

```bash
bunx ecc-universal@2.2.3 setup
```

마법사는 기존 설치 범위(user / project / local)를 먼저 조사한 뒤, `ecc@ecc` 플러그인을 선택한 범위에 설치하거나 옮깁니다. 같은 명령을 다시 실행하면 업데이트, 범위 변경, Hook 프로필 변경도 할 수 있습니다.

**방법 2. Claude Code 네이티브 플러그인 명령**

```text
/plugin marketplace add affaan-m/ECC
/plugin install ecc@ecc
```

**방법 3. 여러 하네스를 한 번에**

```bash
npx ecc-universal@2.2.3 install --guided \
  --harness claude --harness codex \
  --claude-scope local --claude-hooks standard \
  --profile core --yes
```

**한 하네스에는 한 가지 방법만** 사용해야 합니다. 플러그인을 설치한 뒤 `./install.sh --profile full`을 또 실행하면 Skill, Hook이 중복 등록되어 같은 Hook이 두 번 실행됩니다. 이미 겹쳤다면 `uninstall --dry-run`으로 확인한 뒤 정리하고 한 방법으로 다시 설치합니다.

## 기본 설정

Rule은 플러그인이 자동 배포하지 않으므로 직접 설치합니다.

```bash
git clone https://github.com/affaan-m/ECC.git
mkdir -p ~/.claude/rules/ecc
cp -R ECC/rules/common ~/.claude/rules/ecc/
cp -R ECC/rules/typescript ~/.claude/rules/ecc/   # 실제로 쓰는 언어로 교체
```

필요하면 Hook 동작을 환경 변수로 조절합니다.

```bash
export ECC_HOOK_PROFILE=standard            # minimal | standard | strict
export ECC_SESSION_START_MAX_CHARS=4000     # 세션 시작 시 주입할 요약 크기 상한
export ECC_DISABLED_HOOKS="post:edit:typecheck"  # 특정 Hook만 끄기
```

설치 상태는 언제든 점검할 수 있습니다.

```bash
npx ecc-universal@2.2.3 list-installed
npx ecc-universal@2.2.3 doctor
npx ecc-universal@2.2.3 repair
```

## 가장 간단한 예제

Claude Code를 열고 다음을 입력합니다.

```text
/ecc:plan "회원가입 API에 이메일 중복 검사 추가"
```

1. **무엇을 생성하는가**: planner Agent가 구현 계획(변경할 파일, 단계, 위험 요소, 테스트 전략)을 만듭니다.
2. **어떤 값을 전달하는가**: 따옴표 안의 기능 설명과 현재 저장소 코드가 입력이 됩니다.
3. **ECC가 무엇을 처리하는가**: 계획을 보여준 뒤 **사용자의 CONFIRM을 기다립니다.** 확인 전에는 코드를 수정하지 않습니다. 계획이 마음에 들지 않으면 수정을 요청하면 됩니다.
4. **어떤 결과를 반환하는가**: 확인된 계획은 이후 `tdd-workflow`의 입력이 되어 "실패하는 테스트 → 구현 → 리뷰 → 검증" 순서로 이어집니다.

플러그인으로 설치하면 명령이 `/ecc:plan`처럼 네임스페이스가 붙은 형태가 되고, 수동 설치에서는 `/plan` 같은 짧은 형태가 노출될 수 있습니다. 설치된 항목은 `/plugin list ecc@ecc`로 확인합니다.

---

## 설치할 때 주의할 점

- 플러그인 사용 시 `hooks/hooks.json`을 `settings.json`에 복사하지 않습니다. Claude Code 2.1 이상은 플러그인 Hook을 자동으로 읽으므로 복사하면 같은 Hook이 두 번 실행됩니다.
- `.claude-plugin/plugin.json`에 `hooks` 필드를 직접 넣으면 중복 로드 오류가 납니다.
- 수동으로 Skill을 설치할 때는 `~/.claude/skills/<스킬이름>/`에 바로 둡니다. `~/.claude/skills/ecc/` 아래로 한 단계 더 넣으면 인식되지 않습니다.
- 문제가 생기면 `list-installed` → `doctor` → `repair` 순서로 확인하고, 재설치 전에는 `uninstall --dry-run`으로 무엇이 지워지는지 먼저 봅니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 기능 개발과 빌드 복구 →](03-usage-workflow.md)
