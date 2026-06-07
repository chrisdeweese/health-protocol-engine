# Security Policy

## Supported Versions

This repository is pre-1.0. Security fixes are handled on the main branch until a formal release policy exists.

## Reporting A Vulnerability

Do not open public issues for vulnerabilities that could expose private health data or unsafe clinical behavior.

Until a dedicated security contact is published, report privately to the repository owner. Include:

- A short description of the issue.
- Steps to reproduce.
- The affected version, commit, or branch.
- Any relevant input data, with personal health information removed.

## Health Safety Boundary

This engine composes structured intervention data. It does not diagnose, prescribe, replace medical review, or validate whether an intervention is safe for a specific person.

Stage 1 includes only typed safety stubs. Production use must add clinical review workflows, contraindication checks, audit logging, data governance, and a clear user-facing medical disclaimer.
