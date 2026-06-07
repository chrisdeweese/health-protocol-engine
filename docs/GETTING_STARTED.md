# Getting Started

This guide walks through the project from zero to a generated health stack.

## 1. Install

```bash
npm i
npm run build
```

## 2. Verify The Repo

```bash
npm test
npm run build
npm run library:stats
npm run catalog:check
```

Expected shape:

```text
Tests pass
TypeScript passes
Library stats print unit/protocol counts
Catalog check validates data ordering, duplicates, and references
```

## 3. Run The Acceptance Stack

```bash
npm run acceptance
```

This loads all data from disk, applies every protocol to a baseline Blueprint profile, and prints a full `PersonalizedStack`.

The output is intentionally verbose. It proves that the library can compose a complete daily/weekly schedule with evidence counts and collision records.

## 4. Run A Focused Example

```bash
npm run example:rhr
```

This example models a user goal:

```text
Lower resting heart rate
```

The profile includes:

```text
age: 42
resting_hr: 78
cardiovascular_focus: true
hrv_focus: true
insomnia: true
heat_therapy_ok: true
```

The engine composes sleep, exercise, nutrition, recovery, breathwork, and HRV-related protocols into one stack.

## 5. Minimal Code

```ts
import { composeStack } from "health-protocol-engine";

const stack = await composeStack({
  user_id: "demo",
  goal: "general_longevity"
}, {
  selection: {
    ids: ["proto_blueprint_sleep", "proto_blueprint_exercise", "proto_blueprint_nutrition"]
  }
});
console.log(stack.evidence_summary);
console.log(stack.schedule);
```

## 6. What To Look For

Useful output fields:

```text
units                 Canonical intervention units selected by protocol rules
schedule.daily        Grouped daily actions by time slot
schedule.weekly       Grouped weekly actions by time slot
evidence_summary      Counts by A/B/C/D evidence grade
cost_per_month_usd    Sum of included unit costs
review_required       True if pharmaceutical units are present
validation.collisions Dedupe records when protocols requested the same unit
```

## 7. Common Next Steps

For a personal app:

```text
Build a profile form
Select protocol families
Call apply()
Render a schedule and evidence summary
Track outcomes over time
```

For an agent:

```text
Let the agent collect profile context
Use this engine as the deterministic composition tool
Have the agent explain the stack and create follow-up tasks
```
