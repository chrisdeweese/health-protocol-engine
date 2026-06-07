# Protocol Data

`catalog.json` is the canonical production protocol catalog. It contains a single JSON array of protocol records sorted by stable `id`.

The runtime loader reads every `.json` file under this directory recursively, so future large domains can be split into subdirectories if editing a single catalog becomes impractical. Do not duplicate protocol IDs across files.

After changing protocol data, run:

```bash
npm test
npm run build
npm run library:stats
```
