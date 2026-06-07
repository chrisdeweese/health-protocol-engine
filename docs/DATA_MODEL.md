# Data Model

The engine is built around four primary structures:

```text
InterventionUnit
Protocol
UserProfile
PersonalizedStack
```

## InterventionUnit

A canonical intervention.

Examples:

```text
iv_zone2_cardio
iv_cirrhosis_hcc_ultrasound_afp_surveillance
iv_cbti
iv_direct_acting_antiviral_hcv_treatment
```

Required fields:

```text
id
canonical_name
aliases
category
codes
dose
timing
targets
mechanisms
hallmarks
evidence
interaction_keys
contraindications
cost_per_month_usd
burden_score
```

Hard validation rules:

```text
codes must include at least one non-empty code field
evidence.grade is required
mechanisms must have at least one item
burden_score must be 1 through 5
```

Evidence grades:

```text
A  Strong human evidence / guideline-grade recommendation
B  Moderate evidence, observational support, or lower certainty guideline support
C  Emerging, mechanistically plausible, or limited human evidence
D  Weak, discouraged, or insufficient for routine use
```

Categories:

```text
sleep
nutrition
exercise
supplement
pharmaceutical
skin
oral
hair
hydration
light
temperature
breath
stress
measurement
advanced_therapy
```

## Protocol

A protocol is a conditional recipe that references canonical units.

Required fields:

```text
id
name
source
category
intention
actions
applies_when
conflicts_with
```

Each action references a unit id:

```json
{
  "unit": "iv_zone2_cardio",
  "params": { "minutes": 45 },
  "condition": "user.flags.cardiorespiratory_focus == true"
}
```

Important: action `params` are currently preserved in protocol data but do not override unit dose/timing in Stage 1.

## UserProfile

The profile is intentionally simple:

Required input:

```ts
{
  user_id: string;
  goal: string;
}
```

Parsed output:

```ts
{
  user_id: string;
  goal: string;
  goal_pole?: string;
  sex?: "female" | "male" | "intersex" | "unknown";
  pregnant?: boolean;
  age?: number;
  conditions: string[];
  medications: string[];
  constraints: string[];
  flags: Record<string, boolean>;
  biomarkers: Record<string, number>;
}
```

`conditions`, `medications`, `constraints`, `flags`, and `biomarkers` default to empty containers when omitted.

Most protocol logic currently uses boolean flags:

```ts
flags: {
  insomnia: true,
  hrv_focus: true,
  diabetes: true,
  clinician_managed: true
}
```

## PersonalizedStack

The composed output:

```text
user_id
generated_at
goal_pole
units
schedule
validation
evidence_summary
cost_per_month_usd
review_required
```

`review_required` is `true` if any included unit has category `pharmaceutical`.

`validation` contains deterministic composition and safety signals:

```text
collisions            Same canonical unit requested by multiple protocols
interactions          Duplicate medication keys or high-risk class stacking
redundancies          Low-risk overlapping modes worth simplifying
blocked               Profile-matched contraindications with reasons
intention_conflicts   Reserved for future goal-level conflict checks
```

Blocked validation items are reported, not automatically removed from `units` in the current developer-preview engine.

Collisions are not errors. They are explainability records:

```json
{
  "unit_id": "iv_sauna",
  "protocols": [
    "proto_blueprint_exercise",
    "proto_blueprint_nutrition"
  ],
  "resolution": "deduped canonical unit by id"
}
```
