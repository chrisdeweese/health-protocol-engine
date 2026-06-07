# Changelog

All notable changes to this project should be documented here.

## 0.1.0 - Stage 1

- Implemented the typed Health Protocol Engine core.
- Added Zod validation for units, protocols, profiles, stacks, conditions, timings, evidence, and schedule output.
- Added disk-backed canonical JSON catalog loading with loud validation errors.
- Added deterministic protocol application: condition resolution, unit deduplication, collision recording, schedule composition, evidence summaries, cost totals, and pharmaceutical review flags.
- Added canonical data catalogs with 1,302 intervention units and 246 protocols.
- Added CLI acceptance, library stats, smoke tests, and example scripts.
- Added open-source documentation for getting started, architecture, API use, data modeling, app integration, agent integration, production readiness, and contribution workflow.
- Added Apache-2.0 licensing, GitHub Actions CI, `npm run verify`, and catalog integrity checks.
