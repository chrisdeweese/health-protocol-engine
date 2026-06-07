# Architecture

Health Protocol Engine is intentionally small. Runtime behavior is deterministic and local.

## Runtime Flow

```text
Canonical JSON catalogs on disk
  -> composeStack(profile, options)
  -> loadLibrary()
  -> selectProtocols()
  -> apply()
  -> PersonalizedStack
```

## Main Modules

```text
src/schemas.ts      Zod schemas and inferred TypeScript types
src/library.ts      Disk loader and in-memory lookup store
src/conditions.ts   Safe condition evaluator for protocol rules
src/select.ts       Protocol selection helper
src/compose.ts      One-call load/select/apply helper
src/apply.ts        Protocol resolution, dedupe, collisions, schedule, summary
src/safety.ts       Deterministic safety validation signals
src/cli.ts          Acceptance command
```

## Data Directories

```text
data/units/          Intervention-unit catalog and data notes
data/protocols/      Protocol catalog and data notes
dist/data/           Brotli-compressed generated catalog bundle used by published package
docs/                Research, spec, expansion notes, and project docs
test/                Vitest coverage
scripts/             Stats and smoke use-case scripts
examples/            Small runnable examples
```

## Composition Algorithm

`apply()` does five things:

1. Parse and validate the raw user profile.
2. Evaluate each protocol's `applies_when` expression.
3. Evaluate each action's optional `condition`.
4. Resolve each action to a canonical `InterventionUnit`.
5. Dedupe units by `id`, recording collisions when multiple protocols request the same unit.

Then it builds:

```text
daily/weekly schedule
evidence summary
cost total
review_required flag
validation block
```

## Condition Evaluator

Conditions use a deliberately tiny expression language:

```text
user.age >= 65
user.flags.insomnia == true
user.sex == "female" && user.age >= 21
user.flags.hcv_rna_positive == true || user.flags.chronic_hepatitis_c == true
```

Supported:

```text
user.* identifiers only
strings
numbers
booleans
null
!
&&
||
==
!=
>
>=
<
<=
parentheses
```

Not supported:

```text
eval()
function calls
arbitrary JavaScript
network access
filesystem access from conditions
```

## Stage Boundaries

Stage 1 includes:

```text
Typed model
Runtime validation
Disk loader
Protocol condition resolution
Canonical dedupe
Schedule generation
Evidence/cost/review summaries
```

Future stages should add:

```text
Safety validator implementation
Personalized ranking
Contraindication and interaction checks
Outcome tracking
API server package
UI and agent adapters
```

## Design Principles

```text
Canonicalization first: no code, no entry.
Evidence honesty: missing evidence grade is a validation error.
Deterministic runtime: no ML, no LLM, no network.
Explainability: every selected unit can be traced to protocol ids.
Composability: protocols can overlap without duplicate actions.
```
