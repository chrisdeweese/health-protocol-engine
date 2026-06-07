import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadLibrary } from "../src/index.js";

type CatalogRecord = {
  id?: unknown;
};

type ProtocolRecord = CatalogRecord & {
  actions?: Array<{ unit?: unknown }>;
};

const rootDir = process.cwd();
const unitsCatalogPath = path.join(rootDir, "data", "units", "catalog.json");
const protocolsCatalogPath = path.join(rootDir, "data", "protocols", "catalog.json");

async function main(): Promise<void> {
  const jsonFiles = await collectJsonFiles(path.join(rootDir, "data"));
  const expectedJsonFiles = [unitsCatalogPath, protocolsCatalogPath].sort();

  assertEqualLists(
    jsonFiles,
    expectedJsonFiles,
    "Unexpected data JSON files. Keep production data in data/units/catalog.json and data/protocols/catalog.json."
  );

  const units = await readCatalog<CatalogRecord>(unitsCatalogPath, "unit");
  const protocols = await readCatalog<ProtocolRecord>(protocolsCatalogPath, "protocol");

  const unitIds = assertSortedUniqueIds(units, "unit", unitsCatalogPath);
  const protocolIds = assertSortedUniqueIds(protocols, "protocol", protocolsCatalogPath);
  assertProtocolUnitReferences(protocols, unitIds);

  await loadLibrary(rootDir);

  console.log(
    JSON.stringify(
      {
        units: unitIds.size,
        protocols: protocolIds.size,
        data_json_files: jsonFiles.map((filePath) => path.relative(rootDir, filePath))
      },
      null,
      2
    )
  );
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectJsonFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
    })
  );

  return nested.flat().sort((left, right) => left.localeCompare(right));
}

async function readCatalog<T>(filePath: string, label: string): Promise<T[]> {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath}: expected ${label} catalog to be a JSON array`);
  }

  return parsed;
}

function assertSortedUniqueIds(records: CatalogRecord[], label: string, filePath: string): Set<string> {
  const ids: string[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    if (typeof record.id !== "string" || record.id.trim() === "") {
      throw new Error(`${filePath}: ${label} at index ${index} is missing a non-empty id`);
    }

    if (seen.has(record.id)) {
      throw new Error(`${filePath}: duplicate ${label} id "${record.id}"`);
    }

    ids.push(record.id);
    seen.add(record.id);
  });

  const sortedIds = [...ids].sort((left, right) => left.localeCompare(right));
  const firstUnsortedIndex = ids.findIndex((id, index) => id !== sortedIds[index]);

  if (firstUnsortedIndex !== -1) {
    throw new Error(
      `${filePath}: ${label} catalog must be sorted by id; first out-of-order id is "${ids[firstUnsortedIndex]}"`
    );
  }

  return seen;
}

function assertProtocolUnitReferences(protocols: ProtocolRecord[], unitIds: Set<string>): void {
  for (const protocol of protocols) {
    if (!Array.isArray(protocol.actions)) {
      continue;
    }

    for (const action of protocol.actions) {
      if (typeof action.unit === "string" && unitIds.has(action.unit)) {
        continue;
      }

      throw new Error(`Protocol "${protocol.id}" references missing unit "${String(action.unit)}"`);
    }
  }
}

function assertEqualLists(actual: string[], expected: string[], message: string): void {
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(
      `${message}\nExpected:\n${expected.map((item) => `- ${item}`).join("\n")}\nActual:\n${actual
        .map((item) => `- ${item}`)
        .join("\n")}`
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
