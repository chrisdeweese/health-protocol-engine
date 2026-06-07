# App Integration

Health Protocol Engine is best used as a backend composition service inside a larger app.

## Basic Product Flow

```text
User chooses a goal
  -> app collects profile data
  -> app selects protocol families
  -> backend calls apply()
  -> app renders stack
  -> user tracks completion and outcomes
```

## Example Endpoint

```text
POST /api/stacks
```

Request:

```json
{
  "profile": {
    "user_id": "u_123",
    "goal": "lower_resting_heart_rate",
    "age": 42,
    "sex": "male",
    "pregnant": false,
    "conditions": [],
    "medications": [],
    "constraints": [],
    "flags": {
      "cardiovascular_focus": true,
      "hrv_focus": true,
      "insomnia": true
    },
    "biomarkers": {
      "resting_hr": 78
    }
  },
  "protocol_ids": [
    "proto_blueprint_sleep",
    "proto_blueprint_exercise",
    "proto_breath_autonomic_biofeedback"
  ]
}
```

Response:

```json
{
  "units": [],
  "schedule": {
    "daily": {},
    "weekly": {}
  },
  "evidence_summary": {
    "A": 0,
    "B": 0,
    "C": 0,
    "D": 0
  },
  "cost_per_month_usd": 0,
  "review_required": false,
  "validation": {
    "collisions": []
  }
}
```

## Suggested UI Views

```text
Today
  Daily units grouped by time_of_day

This Week
  Weekly units grouped by time_of_day

Why This Appeared
  Show unit targets, mechanisms, evidence, and protocol ids

Evidence
  A/B/C/D counts and citation links

Cost & Burden
  Monthly cost estimate and burden_score

Review Required
  Separate medications and advanced therapies from self-directed habits
```

## Protocol Selection Strategies

Simple:

```text
Let users choose protocol families manually.
```

Goal-based:

```text
Map app goals to protocol ids.
```

Examples:

```text
lower_resting_heart_rate
  proto_blueprint_sleep
  proto_blueprint_exercise
  proto_blueprint_nutrition
  proto_breath_autonomic_biofeedback

cardiometabolic_risk
  proto_preventive_cardiometabolic_screening
  proto_cardiometabolic_advanced_ascvd_risk_stratification
  proto_cardiometabolic_dyslipidemia_treatment_monitoring

sleep_recovery
  proto_blueprint_sleep
  proto_sleep_insomnia_behavioral_pharmacology
  proto_sleep_osa_screening_diagnosis
```

Agent-assisted:

```text
Use an agent to collect context and suggest protocol families,
then call the deterministic engine.
```

## Production Notes

Recommended server lifecycle:

```text
Create protocol engine once on process start
Reuse its cached InterventionLibrary
Validate incoming profiles
Run engine.composeStack()
Persist generated stack snapshots if needed
```

Minimal server setup:

```ts
import { createProtocolEngine, type UserProfileInput } from "health-protocol-engine";

const engine = await createProtocolEngine();

export async function createStack(profile: UserProfileInput) {
  return engine.composeStack(profile, {
    selection: {
      idPrefixes: ["proto_blueprint_", "proto_lifestyle_"]
    }
  });
}
```

Avoid:

```text
Reloading JSON on every request
Presenting pharmaceutical units as self-directed advice
Letting an LLM invent protocol ids or unit ids
Skipping evidence/citation display
```
