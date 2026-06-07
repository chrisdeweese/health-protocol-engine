## Summary

-

## Type

- [ ] Engine/API
- [ ] Catalog data
- [ ] Safety validation signal
- [ ] CLI/tooling
- [ ] Documentation
- [ ] Tests only

## Safety Boundary

Health Protocol Engine is a research/developer toolkit, not medical advice.

- [ ] This change does not add diagnosis, treatment, dosing, or individual safety guidance.
- [ ] Pharmaceutical, procedure, urgent-care, pregnancy/lactation, or condition-specific content is represented as structured data with appropriate review signals.
- [ ] User-facing claims remain educational/research/developer oriented.
- [ ] No personal health information is included.

## Evidence And Data

- [ ] New or changed intervention units include stable ids, codes, citations, evidence grades, cost, and burden.
- [ ] Evidence grades are conservative and follow `docs/CONTRIBUTING.md`.
- [ ] Protocol conditions are deterministic and only reference supported `user.*` fields.
- [ ] Source notes were updated in `docs/library-expansion-sources.md` when catalog data changed.
- [ ] Not applicable.

## Verification

- [ ] `npm run verify`
- [ ] `npm run catalog:check`
- [ ] `npm run smoke:use-cases`
- [ ] `npm run acceptance`
- [ ] Documentation-only change, commands not run.

## Notes For Reviewers

-
