# AI GitHub Daily — {{date}}

> 수집 {{repositoryCount}}개 · 신규 {{newCount}}개 · 오늘의 Study {{selectedCount}}개
> 비교 기준: {{baselineLabel}}

## 🔥 24h Growth TOP {{topN}}

{{#hasGrowth}}
| # | Repository | ⭐ Stars | Δ | 설명 |
|---:|---|---:|---:|---|
{{#growth}}
| {{rank}} | [{{repository}}]({{url}}) | {{stars}} | {{delta}} | {{description}} |
{{/growth}}
{{/hasGrowth}}
{{^hasGrowth}}
{{noGrowthReason}}
{{/hasGrowth}}

## ⭐ Total Stars TOP {{topN}}

| # | Repository | ⭐ Stars | Δ | 설명 |
|---:|---|---:|---:|---|
{{#totalStars}}
| {{rank}} | [{{repository}}]({{url}}) | {{stars}} | {{delta}} | {{description}} |
{{/totalStars}}

## 🆕 신규 발견 {{newCount}}개

{{#bootstrapNote}}
{{bootstrapNote}}

{{/bootstrapNote}}
{{#newly}}
- [{{repository}}]({{url}}) — ⭐ {{stars}} · {{description}}
{{/newly}}
{{^newly}}
오늘 새로 발견한 저장소가 없다.
{{/newly}}
{{#newMoreCount}}

외 {{newMoreCount}}개는 `study-queue.json`에서 확인할 수 있다.
{{/newMoreCount}}

## 📚 오늘의 Study

{{#selected}}
- **[{{repository}}]({{url}})** (점수 {{priority}}) — {{reasons}}
{{/selected}}
{{^selected}}
오늘 선정된 Study 후보가 없다.
{{/selected}}

<details><summary>Study Queue 전체 ({{candidateCount}}개)</summary>

| Repository | 점수 | 상태 | 사유 |
|---|---:|---|---|
{{#candidates}}
| {{repository}} | {{priority}} | {{status}} | {{reasons}} |
{{/candidates}}

</details>
