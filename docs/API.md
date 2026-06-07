# API

The public API is exported from the package root.

```ts
export { apply } from "./apply.js";
export { composeStack, createProtocolEngine } from "./compose.js";
export { evaluateCondition } from "./conditions.js";
export { InterventionLibrary, LibraryLoadError, loadLibrary } from "./library.js";
export { validateSafety } from "./safety.js";
export { selectProtocols } from "./select.js";
export * from "./schemas.js";
```

## composeStack()

One-call path for app code.

```ts
import { composeStack } from "health-protocol-engine";

const stack = await composeStack({
  user_id: "demo",
  goal: "general_longevity"
}, {
  selection: {
    idPrefixes: ["proto_sleep_"]
  }
});
```

Behavior:

```text
Loads the bundled library unless a library or libraryRoot is supplied
Selects protocols with selectProtocols() unless explicit protocols are supplied
Composes the final PersonalizedStack with apply()
```

Use `loadLibrary()`, `selectProtocols()`, and `apply()` directly when you need long-lived library caching, custom protocol assembly, or lower-level diagnostics.

## createProtocolEngine()

Reusable facade for servers and repeated composition.

```ts
import { createProtocolEngine } from "health-protocol-engine";

const engine = await createProtocolEngine();
const stack = await engine.composeStack(profile, {
  selection: {
    idPrefixes: ["proto_sleep_"]
  }
});
```

Behavior:

```text
Loads the library once
Keeps the InterventionLibrary available as engine.library
Provides engine.selectProtocols(profile, selection)
Provides engine.composeStack(profile, options)
```

Use this for API servers, workers, or tests that compose many stacks in one process.

## loadLibrary()

Loads and validates canonical JSON catalogs from `data/units` and `data/protocols`.

```ts
import { loadLibrary } from "health-protocol-engine";

const library = await loadLibrary();
```

Default root:

```ts
the package data root
```

In source and custom roots, that resolves to readable catalogs under `data/`. In the published package, build output uses one Brotli-compressed `dist/data/catalog.json.br` bundle to reduce install size.

Expected layout:

```text
data/units/catalog.json
data/protocols/catalog.json
```

The loader discovers `.json` files recursively, so either directory can be split into subdirectories as the library grows. The current production layout uses one `catalog.json` per data directory.

Validation failures throw `LibraryLoadError` with:

```text
file path
field path
message
```

## InterventionLibrary

In-memory lookup store.

```ts
library.getUnit("iv_zone2_cardio");
library.getProtocol("proto_blueprint_exercise");
library.getUnitsByCategory("exercise");
library.getUnitsByMechanism("cardiorespiratory_fitness");
library.allUnits();
library.allProtocols();
```

## selectProtocols()

Selects protocols before composition.

```ts
import { selectProtocols } from "health-protocol-engine";

const protocols = selectProtocols(library, {
  ids: ["proto_blueprint_sleep", "proto_blueprint_exercise"],
  profile
});
```

Options:

```text
ids             Exact protocol ids. Missing ids throw.
categories      Protocol categories to include.
idPrefixes      Prefix filters such as proto_sleep_ or proto_clinical_.
profile         UserProfileInput used to evaluate applies_when.
applicableOnly  Defaults to true when profile is supplied.
include         Optional predicate for app-specific filtering.
```

Filters are combined. Returned protocols stay deterministic: explicit `ids` preserve requested order, otherwise library order is used.

## apply()

Composes protocols against a user profile.

```ts
import { apply } from "health-protocol-engine";

const stack = apply(protocols, profile, library);
```

Inputs:

```ts
Protocol[]
UserProfileInput
InterventionLibrary
```

Output:

```ts
PersonalizedStack
```

Behavior:

```text
Evaluates protocol applies_when
Evaluates action condition
Looks up canonical units by id
Dedupes repeated units
Records collisions
Builds schedule
Counts evidence grades
Sums cost
Flags review_required when any unit category is pharmaceutical
Adds safety validation for duplicate medication keys, high-risk interaction classes, redundancies, and profile-matched contraindications
```

## validateSafety()

Evaluates selected units for deterministic safety signals.

```ts
import { validateSafety } from "health-protocol-engine";

const validation = validateSafety(units, profile);
```

Current checks:

```text
Duplicate RxNorm medication keys
Curated high-risk interaction-class stacking
Low-risk redundancy classes such as duplicate monitoring or exercise modes
Contraindications matched against profile pregnancy, flags, conditions, constraints, and medications
```

`apply()` calls this automatically. Calling it directly is useful for diagnostics, tests, and apps that assemble units without protocol composition.

## evaluateCondition()

Evaluates a condition string against a profile.

```ts
evaluateCondition("user.age >= 65", profile);
evaluateCondition("user.flags.insomnia == true", profile);
```

Use this for diagnostics and tests. Product code usually calls `apply()` instead.

## Schemas

Every core structure has a Zod schema and inferred TypeScript type:

```ts
InterventionUnitSchema
ProtocolSchema
UserProfileSchema
PersonalizedStackSchema
TimingSchema
EvidenceSchema
```

Example:

```ts
const profile = UserProfileSchema.parse({
  user_id: "demo",
  goal: "lower_resting_heart_rate",
  flags: {
    hrv_focus: true
  },
  biomarkers: {
    resting_hr: 78
  }
});
```
