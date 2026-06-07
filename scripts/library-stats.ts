import { loadLibrary } from "../src/index.js";

const library = await loadLibrary(process.cwd());
const units = library.allUnits();
const protocols = library.allProtocols();
const categoryCounts = new Map<string, number>();
const mechanismCounts = new Map<string, number>();

for (const unit of units) {
  categoryCounts.set(unit.category, (categoryCounts.get(unit.category) ?? 0) + 1);
  for (const mechanism of unit.mechanisms) {
    mechanismCounts.set(mechanism, (mechanismCounts.get(mechanism) ?? 0) + 1);
  }
}

console.log(
  JSON.stringify(
    {
      units: units.length,
      protocols: protocols.length,
      categories: Object.fromEntries([...categoryCounts.entries()].sort()),
      mechanisms: Object.fromEntries([...mechanismCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
    },
    null,
    2
  )
);
