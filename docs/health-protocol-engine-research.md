# Research Rationale

Health Protocol Engine started from a recipe-engine analogy: canonical ingredients, recipes, substitutions, and safety constraints. The current package implements the deterministic core of that idea without ML.

## Transferable Idea

The useful part of the recipe analogy is not recipe generation. It is the discipline of representing messy real-world actions as a canonical vocabulary, then composing them through explicit rules:

```text
ingredient -> intervention unit
recipe -> protocol
serving/context -> user profile
cooked dish -> PersonalizedStack
allergen/conflict check -> safety validation
```

## Current Position

The implemented system is deliberately conservative:

- canonical intervention units with codes, dose, timing, targets, mechanisms, evidence, contraindications, cost, and burden
- protocols that reference units through deterministic conditions
- composition that dedupes repeated units and records collisions
- safety signals based on interaction classes, duplicate medication keys, redundancies, and profile-matched contraindications
- evidence summaries and medication-review flags
- no runtime LLM, ML model, network call, or biomarker prediction

The engine is therefore infrastructure for apps and agents, not a medical decision-maker.

## Research Threads

The longer-term research roadmap remains useful, but it should stay downstream of the typed core:

1. Build richer co-prescription and mechanism graphs after the catalog is stable.
2. Explore embedding operators for substitution and goal-biased navigation.
3. Add external drug, supplement, and contraindication knowledge graphs only behind explicit clinical-review boundaries.
4. Benchmark any generated explanations or personalization layer against clinician-reviewed cases.

## Safety Implications

Health protocols differ from food recipes because substitutions can change clinical risk. Any future personalization layer must preserve:

```text
evidence grade visibility
clinician review for pharmaceutical and advanced-therapy units
clear separation between self-directed habits and clinical care
deterministic validation before user-facing explanation
```

LLMs may explain, summarize, or help users navigate the stack, but this package remains the deterministic source of truth.

## Regulatory Posture

Keep product claims in the general wellness and developer-infrastructure lane unless a deployment adds clinical oversight, audit trails, regulatory controls, and production-grade interaction knowledge.

This repository should not market generated stacks as diagnosis, treatment, cure, medication instruction, or replacement for clinician judgment.
