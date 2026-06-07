# Health Protocol Engine

Deterministic TypeScript infrastructure for turning validated health, prevention, and longevity protocols into typed action plans.

## Package

- 1,302 intervention units and 246 protocols
- Typed ESM API, CLI, Zod validation, Brotli catalog
- No runtime network, ML, or LLM dependency

## Install

```bash
npm i health-protocol-engine
```

## Quick Use

```ts
import { composeStack } from "health-protocol-engine";

const stack = await composeStack(
  { user_id: "demo", goal: "general_longevity" },
  {
    selection: {
      ids: ["proto_blueprint_sleep", "proto_blueprint_exercise", "proto_blueprint_nutrition"]
    }
  }
);

console.log(stack.evidence_summary, stack.schedule.weekly);
```

## Output Shape

```ts
type PersonalizedStack = {
  user_id: string;
  units: InterventionUnit[];
  schedule: { daily: Record<string, ScheduledUnit[]>; weekly: Record<string, ScheduledUnit[]> };
  validation: { interactions: unknown[]; redundancies: unknown[]; blocked: unknown[]; collisions: Collision[] };
  evidence_summary: { A: number; B: number; C: number; D: number };
  cost_per_month_usd: number;
  review_required: boolean;
};
```

## Model

`InterventionUnit` is a canonical health action with codes, dose, timing, targets, mechanisms, evidence, contraindications, cost, and burden. `Protocol` is a conditional recipe of unit actions. `UserProfile` supplies goal, demographics, flags, medications, constraints, conditions, and biomarkers. Repeated requested units are deduped and recorded in `validation.collisions`.

## Safety Boundary

This is research/developer infrastructure, not medical advice. Signals include type validation, evidence-grade enforcement, medication review flags, collision tracking, duplicate medication-key checks, high-risk interaction-class checks, redundancies, and profile-matched contraindications.

Not implemented: personalized ranking, outcome learning, clinician approval workflow, regulatory controls, external drug-drug interaction graph, or automatic removal of blocked units. Apps should show disclaimers and avoid presenting pharmaceutical or advanced-therapy units as user instructions.

## App Integration

Use `composeStack(profile, options)` behind an API endpoint, then render schedule, evidence, cost, review state, and why each action appeared.

## Development

```bash
npm i
npm run verify
npm run smoke:use-cases
```

When adding data, update the JSON catalogs, tests, and source notes. Every unit needs at least one code and an explicit evidence grade.

## License

Apache-2.0. See [LICENSE](LICENSE).
