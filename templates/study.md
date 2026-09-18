---
repository: {{repository}}
url: {{url}}
stars: {{stars}}
studiedAt: {{date}}
status: draft
---

# {{repository}}

{{summary}}

## {{n.problem}}. 어떤 문제를 푸는가

{{problem}}

{{#facts}}
- {{claim}}{{refs}}
{{/facts}}

{{#hasArchitecture}}
## {{n.architecture}}. 핵심 구조

{{#architecture}}
- {{component}} : {{role}}{{refs}}
{{/architecture}}

{{/hasArchitecture}}
{{#hasFeatures}}
## {{n.features}}. 주요 기능

{{#keyFeatures}}
- {{name}} : {{detail}}{{refs}}
{{/keyFeatures}}

{{/hasFeatures}}
{{#gettingStarted}}
## {{n.gettingStarted}}. 시작하기

```bash
{{install}}
```
{{#minimalExample}}

```{{language}}
{{minimalExample}}
```
{{/minimalExample}}

설치와 예제는 공식 문서 기준입니다.{{refs}}

{{/gettingStarted}}
{{#hasReleases}}
## {{n.releases}}. 최근 변화

{{#recentReleases}}
- {{version}} ({{date}}){{refs}}
{{#highlights}}
    - {{.}}
{{/highlights}}
{{/recentReleases}}

{{/hasReleases}}
{{#hasCommunity}}
## {{n.community}}. 커뮤니티에서 반복되는 주제

{{#communitySignals}}
- {{topic}}{{refs}}
{{/communitySignals}}

{{/hasCommunity}}
{{#hasLimitations}}
## {{n.limitations}}. 한계와 주의점

{{#limitations}}
- {{point}}{{refs}}
{{/limitations}}

{{/hasLimitations}}
{{#hasOpenQuestions}}
## {{n.openQuestions}}. 더 알아볼 것

{{#openQuestions}}
- {{.}}
{{/openQuestions}}

{{/hasOpenQuestions}}
## 참고 자료

{{#sources}}
- [{{label}}]({{url}}) ({{type}})
{{/sources}}

{{#footnotes}}
[^{{id}}]: [{{label}}]({{url}})
{{/footnotes}}
