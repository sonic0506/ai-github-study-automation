# github-researcher 평가 Rubric

## 1단계: 적합성 판정
fixture: `tests/fixtures/*-input.json`의 `expected`와 비교한다.

- [ ] ★ `studyability`가 `registry.schema.json#/$defs/studyability` 형식이다 (category와 studyable 조합 일치).
- [ ] ★ fixture의 `expected.studyable` / `expected.category`와 일치한다.
- [ ] ★ Study 대상이 아니면 조사를 진행하지 않고 `{repository, studyability}`만 반환했다.
- [ ] `reason`이 README에서 확인 가능한 사실 한 문장이다 (추측·평가 표현 없음).
- [ ] 애매한 저장소를 억지로 제외하지 않았다.

## 2단계: Research Note (Study 대상인 경우)

- [ ] ★ 출력이 JSON이며 `resources/research-note.example.json`의 필드를 모두 가진다.
- [ ] ★ 모든 `facts[]`, `keyFeatures[]`가 존재하는 `sources[].id`를 참조한다.
- [ ] ★ 출처 URL이 실제로 존재한다 (임의 3개 확인).
- [ ] ★ 숫자·버전·날짜가 출처와 일치한다.
- [ ] README 외 최소 1종 이상의 출처(docs / release / issues)를 사용했다.
- [ ] 불확실한 내용은 `openQuestions`에 있다.
- [ ] 의견, 감탄, 비유, 사용자 문체가 없다.
