# Contributing

Contributions should preserve the engine's core properties:

```text
Deterministic
Typed
Evidence-labeled
Canonical
Explainable
No runtime ML/LLM/network dependencies
```

## Setup

```bash
npm i
npm run verify
```

## Adding Intervention Units

Add units under:

```text
data/units/catalog.json
```

`catalog.json` is sorted by stable `id`. Keep it sorted after edits.

Rules:

```text
Use stable ids: iv_domain_specific_name
Include at least one code
Include an explicit evidence grade
Include citations
Use honest evidence grades
Prefer canonical units over near-duplicates
Add contraindications as structured strings
Set a rough monthly cost
Set burden_score 1-5
```

Do not:

```text
Add units with no code
Omit evidence.grade
Use hype language
Create duplicate units for the same intervention
Represent prescription/procedure items as casual habits
```

## Adding Protocols

Add protocols under:

```text
data/protocols/catalog.json
```

`catalog.json` is sorted by stable `id`. Keep it sorted after edits.

Rules:

```text
Use stable ids: proto_domain_specific_pathway
Reference existing unit ids when possible
Use conditions only over user.* fields
Keep conditions deterministic
Add source names in protocol.source
Let collisions happen when two protocols legitimately share a unit
```

## Evidence Grades

Use conservative grading:

```text
A  Strong guideline/RCT/meta-analysis support for the represented use
B  Moderate evidence, observational evidence, or lower-certainty guideline context
C  Early, limited, mechanistic, or emerging evidence
D  Weak, discouraged, or not recommended for routine use
```

If unsure, grade lower.

## Tests

Add tests when:

```text
New protocols have meaningful conditional behavior
New units should trigger review_required
Collisions should be recorded
Loader validation needs coverage
```

Required before submitting:

```bash
npm run verify
```

## Documentation

When adding a batch, update:

```text
docs/library-expansion-sources.md
```

Include:

```text
batch domain
source families
clinician-gated item classes
expected shared-unit collisions
```
