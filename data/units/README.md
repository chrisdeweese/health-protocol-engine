# Unit Data

`catalog.json` is the canonical production intervention-unit catalog. It contains a single JSON array of unit records sorted by stable `id`.

The runtime loader reads every `.json` file under this directory recursively, so future large domains can be split into subdirectories if editing a single catalog becomes impractical. Do not duplicate unit IDs across files.

After changing unit data, run:

```bash
npm test
npm run build
npm run library:stats
```
