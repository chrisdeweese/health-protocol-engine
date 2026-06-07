# Technical Specification

Health Protocol Engine is a deterministic TypeScript package for composing evidence-labeled health protocol stacks.

## Design Goals

```text
Deterministic
Typed
Small package surface
Readable source catalogs
Compressed install catalogs
No runtime network, ML, or LLM dependency
Clear safety boundary
```

## Package Shape

```text
src/                  TypeScript source
data/                 Readable source catalogs
dist/                 Built ESM, declarations, compact Brotli catalogs
scripts/              Build, catalog checks, stats, smoke cases
test/                 Deterministic behavior coverage
docs/                 Implementation and contribution notes
```

The published package ships only `dist`, plus npm-required `README.md`, `LICENSE`, and `package.json`.

## Data Model

`InterventionUnit` is the canonical action:

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

`Protocol` is the recipe:

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

`UserProfileInput` is the condition context:

```text
user_id
goal
goal_pole
sex
pregnant
age
conditions
medications
constraints
flags
biomarkers
```

`PersonalizedStack` is the output:

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

## Runtime Flow

```text
loadLibrary()
  -> read data/units and data/protocols
  -> decompress .json.br or .json.gz when needed
  -> expand compact packaged rows when present
  -> validate with Zod schemas
  -> build InterventionLibrary indexes

selectProtocols()
  -> filter by ids, categories, prefixes, profile applicability, include predicate

apply()
  -> evaluate protocol/action conditions
  -> resolve unit ids
  -> dedupe canonical units
  -> record collisions
  -> build daily/weekly schedule
  -> validate safety signals
  -> summarize evidence and cost

composeStack()
  -> convenience wrapper for load/select/apply
```

## Safety Layer

Implemented deterministic signals:

```text
duplicate RxNorm key checks
high-risk interaction-class checks
redundancy class checks
profile-matched contraindication checks
collision tracking
pharmaceutical review flag
evidence-grade enforcement
```

Not implemented:

```text
external drug-drug interaction API
drug-supplement knowledge graph
personalized ranking
outcome learning
clinician workflow
regulatory production controls
automatic removal of blocked units
```

## Catalog Build

Source catalogs stay readable in `data/units/catalog.json` and `data/protocols/catalog.json`.

`scripts/prepare-package-data.mjs` converts them into compact rows and Brotli-compresses one generated `dist/data/catalog.json.br` bundle. `loadLibrary()` expands those rows back into canonical objects before validation, so public runtime output is the same shape as source JSON.

## Public API

```ts
apply(protocols, profile, library);
composeStack(profile, options);
createProtocolEngine(options);
evaluateCondition(condition, profile);
loadLibrary(rootDir);
selectProtocols(library, options);
validateSafety(units, profile);
```

All schemas and core types are exported from the package root.

## Build Gates

Every change should pass:

```bash
npm run verify
npm run smoke:use-cases
```

`npm run verify` covers typecheck, build, unit tests, catalog integrity, library stats, and npm dry-pack.

The smoke output hash is used as a broad deterministic regression signal for composed use cases.
