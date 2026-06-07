# Roadmap

This roadmap is organized by maturity stage.

## Stage 1: Deterministic Core

Status: implemented.

```text
Typed data model
Zod validation
Disk JSON loader
In-memory lookup store
Safe condition evaluator
Protocol resolution
Canonical dedupe
Collision records
Daily/weekly schedule generation
Evidence summary
Cost summary
Pharmaceutical review flag
Safety validation signals
Acceptance and smoke commands
```

## Stage 2: Safety Validator

Goal: expand `validateSafety()` from deterministic catalog signals to production-grade clinical safety.

Items:

```text
External medication interaction knowledge graph
Pregnancy and lactation blocking rules
Age-specific blocking rules
Intention conflict detection
Automatic severe-risk removal or gating behavior
Clinician-review queue semantics
Unit tests for high-risk examples
```

## Stage 3: Ranking And Prioritization

Goal: move from "all applicable actions" to "best next actions."

Items:

```text
Priority score
Evidence-weighted ranking
Burden/cost-aware ranking
Goal-target fit
Risk urgency
User constraints
Top 3 / Top 5 starter plan
Defer list
Clinician-review list
```

## Stage 4: Personalization

Goal: adapt stacks to individual response data.

Items:

```text
Outcome tracking
Biomarker deltas
Adherence history
Wearable data ingestion
Response classification
Dose/timing adjustment proposals
Experiment windows
Stop/continue/escalate recommendations
```

## Stage 5: Production API

Goal: package the engine for real apps.

Items:

```text
HTTP API example
Versioned library snapshots
Protocol selection helpers
OpenAPI spec
Error taxonomy
Request/response examples
Dockerfile
CI workflow
Release workflow
```

## Stage 6: Governance

Goal: make library expansion auditable.

Items:

```text
Citation quality rules
Evidence grade rubric
Clinical review process
Source freshness policy
Deprecation policy
Change logs per protocol family
Medical disclaimer templates
Maintainer roles
```

## Stage 7: Agent And UI Adapters

Goal: make the engine easy to use from apps and agents.

Items:

```text
Goal-to-protocol maps
Questionnaire templates
Agent tool wrappers
React schedule components
Evidence badge components
Review-required workflow
Stack explanation endpoint
Task/reminder export
```
