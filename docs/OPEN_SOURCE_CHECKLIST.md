# Open Source Checklist

Before publishing the repository publicly, complete this checklist.

## Required

```text
[x] Choose a license and add LICENSE
[x] Confirm package name
[x] Confirm package description
[x] Remove private package flag
[x] Add package export map, types, files whitelist, and CLI bin
[ ] Confirm repository URL
[ ] Run npm test
[ ] Run npm run build
[ ] Run npm run library:stats
[ ] Run npm run catalog:check
[ ] Run npm run verify
[ ] Run npm run acceptance
[ ] Run npm audit --omit=dev
[ ] Decide whether to upgrade dev tooling for full npm audit cleanliness
[ ] Review README medical disclaimer
[ ] Review docs/PRODUCTION_READINESS.md
```

## Recommended Files

Already included:

```text
LICENSE
README.md
.github/workflows/ci.yml
docs/GETTING_STARTED.md
docs/ARCHITECTURE.md
docs/API.md
docs/DATA_MODEL.md
docs/APP_INTEGRATION.md
docs/AGENTS.md
docs/ROADMAP.md
docs/PRODUCTION_READINESS.md
docs/CONTRIBUTING.md
SECURITY.md
CHANGELOG.md
examples/
```

Consider adding after choosing project policy:

```text
CODE_OF_CONDUCT.md
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
```

## License Choice

Chosen option:

```text
Apache-2  Permissive with explicit patent grant
```

## Health/Medical Review

Before public release, decide how you want to position the project:

```text
Research library
Developer toolkit
Personal health planning infrastructure
Clinical decision support component
Consumer health app backend
```

The current repo is safest to publish as:

```text
Research/developer toolkit, not medical advice.
```

## Suggested Initial Release Tag

```text
v0.1.0-developer-preview
```
