# Production Readiness

Health Protocol Engine is currently a developer preview. It is useful as a deterministic protocol-composition library, but production health apps need additional controls.

## Already Present

```text
Strict TypeScript
Runtime Zod validation
No runtime network access
No runtime LLM calls
Safe condition evaluator, no eval()
Validation failures include file and field path
Pharmaceutical review flag
Collision explainability
Deterministic safety validation signals
Vitest coverage
Acceptance command
Smoke use-case command
Canonical unit and protocol catalogs
Catalog integrity command
GitHub Actions CI
Apache-2.0 license
```

## Required Before Production Apps

### Safety

```text
Expand contraindication matching beyond string/profile-token rules
Add external medication interaction review
Add pregnancy/lactation rules
Add severe-risk blocking behavior
Create clinician-review queue semantics
```

### Governance

```text
Add formal evidence grading policy
Add citation freshness policy
Add reviewer ownership for clinical domains
Track source versions
Document deprecation behavior
```

### Engineering

```text
Add CI
Add API example
Add schema versioning
Add structured error codes
Add fixtures for downstream integration tests
Add release notes / changelog
Add catalog integrity checks in CI
```

### Product

```text
Add user-facing medical disclaimers
Separate habits from clinician-managed actions
Explain why each unit appears
Let users hide/defer actions
Track adherence and outcomes
Show evidence and cost transparently
```

## Suggested Risk Labels

For UI or API consumers:

```text
self_directed
clinician_review
urgent_triage
prescription_only
procedure_or_advanced_therapy
monitoring_only
```

These labels are not fully modeled yet. They should be added before production-facing use.

## Medical Disclaimer Template

Use a disclaimer appropriate to your jurisdiction and product. A conservative starting point:

```text
This software is for educational and research purposes. It does not diagnose, treat, or replace professional medical advice. Medication, procedure, urgent-care, pregnancy, and condition-specific recommendations require review by a qualified clinician.
```

## Production Recommendation

Use the current engine for:

```text
Developer prototypes
Internal research tools
Personal planning experiments
Agent tool experiments
Non-clinical education products with clear disclaimers
```

Do not use it yet for:

```text
Autonomous clinical decision support
Medication instructions without clinician review
Emergency triage
Regulated medical device workflows
```
