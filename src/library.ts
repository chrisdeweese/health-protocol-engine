import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompress, gunzip } from "node:zlib";
import { z } from "zod";
import {
  Category,
  CategorySchema,
  InterventionUnit,
  InterventionUnitSchema,
  Protocol,
  ProtocolSchema,
  DirectionSchema,
  EvidenceGradeSchema
} from "./schemas.js";

const UNIT_KEYS =
  "id canonical_name aliases category codes dose timing targets mechanisms hallmarks evidence interaction_keys contraindications cost_per_month_usd burden_score";
const PROTOCOL_KEYS = "id name source category intention actions applies_when conflicts_with";
const CODES_KEYS = "local fdc rxnorm loinc idisk snomed cpa unii";
const DOSE_KEYS = "value unit route scalable range";
const TIMING_KEYS = "frequency time_of_day with_food duration_min relative_to days_of_week cycle";
const TARGET_KEYS = "biomarker direction loinc";
const EVIDENCE_KEYS = "grade best_study human_rct citations";
const INTERACTION_KEYS = "interaction_class rxnorm";
const CATEGORIES = (CategorySchema as unknown as { options: string[] }).options;
const DIRECTIONS = (DirectionSchema as unknown as { options: string[] }).options;
const EVIDENCE_GRADES = (EvidenceGradeSchema as unknown as { options: string[] }).options;

export class LibraryLoadError extends Error {
  constructor(
    readonly filePath: string,
    readonly field: string,
    message: string
  ) {
    super(`${filePath}: ${field}: ${message}`);
    this.name = "LibraryLoadError";
  }
}

export class InterventionLibrary {
  private readonly unitsById = new Map<string, InterventionUnit>();
  private readonly protocolsById = new Map<string, Protocol>();
  private readonly unitsByCategory = new Map<Category, InterventionUnit[]>();
  private readonly unitsByMechanism = new Map<string, InterventionUnit[]>();

  constructor(units: InterventionUnit[], protocols: Protocol[]) {
    for (const unit of units) {
      if (this.unitsById.has(unit.id)) {
        throw new Error(`Duplicate InterventionUnit id "${unit.id}"`);
      }
      this.unitsById.set(unit.id, unit);

      addGrouped(this.unitsByCategory, unit.category, unit);

      for (const mechanism of unit.mechanisms) {
        addGrouped(this.unitsByMechanism, mechanism, unit);
      }
    }

    for (const protocol of protocols) {
      if (this.protocolsById.has(protocol.id)) {
        throw new Error(`Duplicate Protocol id "${protocol.id}"`);
      }
      this.protocolsById.set(protocol.id, protocol);
    }
  }

  getUnit(id: string): InterventionUnit | undefined {
    return this.unitsById.get(id);
  }

  getProtocol(id: string): Protocol | undefined {
    return this.protocolsById.get(id);
  }

  getUnitsByCategory(category: Category): InterventionUnit[] {
    return [...(this.unitsByCategory.get(CategorySchema.parse(category)) ?? [])];
  }

  getUnitsByMechanism(mechanism: string): InterventionUnit[] {
    return [...(this.unitsByMechanism.get(mechanism) ?? [])];
  }

  allUnits(): InterventionUnit[] {
    return [...this.unitsById.values()];
  }

  allProtocols(): Protocol[] {
    return [...this.protocolsById.values()];
  }
}

function addGrouped<K, T>(grouped: Map<K, T[]>, key: K, item: T): void {
  grouped.get(key)?.push(item) ?? grouped.set(key, [item]);
}

export async function loadLibrary(rootDir?: string): Promise<InterventionLibrary> {
  const dataRoot = rootDir ?? (await defaultLibraryRoot());
  const bundledCatalog = path.join(dataRoot, "data", "catalog.json.br");
  if (await pathExists(bundledCatalog)) {
    return loadPackedLibrary(bundledCatalog);
  }

  const [units, protocols] = await Promise.all([
    loadJsonFiles(path.join(dataRoot, "data", "units"), InterventionUnitSchema),
    loadJsonFiles(path.join(dataRoot, "data", "protocols"), ProtocolSchema)
  ]);

  return new InterventionLibrary(units, protocols);
}

async function defaultLibraryRoot(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  if (await pathExists(path.join(moduleDir, "data"))) {
    return moduleDir;
  }

  return path.resolve(moduleDir, "..");
}

async function loadPackedLibrary(filePath: string): Promise<InterventionLibrary> {
  let unitsJson: unknown;
  let protocolsJson: unknown;
  try {
    [protocolsJson, unitsJson] = requireRow(JSON.parse(await readJsonText(filePath)));
  } catch (error) {
    throw new LibraryLoadError(filePath, "$", error instanceof Error ? error.message : String(error));
  }

  const units = parseJsonRecords(
    filePath,
    "units",
    expandPackedCatalog(unitsJson, InterventionUnitSchema),
    InterventionUnitSchema
  );
  const protocols = parseJsonRecords(
    filePath,
    "protocols",
    expandPackedCatalog(protocolsJson, ProtocolSchema),
    ProtocolSchema
  );

  return new InterventionLibrary(units, protocols);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJsonFiles<S extends z.ZodTypeAny>(dir: string, schema: S): Promise<z.output<S>[]> {
  const jsonFiles = await collectJsonFiles(dir);
  return (await Promise.all(jsonFiles.map((filePath) => loadJsonFile(filePath, schema)))).flat();
}

async function collectJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          return collectJsonFiles(entryPath);
        }

        return entry.isFile() &&
          (entry.name.endsWith(".json") || entry.name.endsWith(".json.gz") || entry.name.endsWith(".json.br"))
          ? [entryPath]
          : [];
      })
    )
  )
    .flat()
    .sort((left, right) => left.localeCompare(right));
}

async function loadJsonFile<S extends z.ZodTypeAny>(filePath: string, schema: S): Promise<z.output<S>[]> {
  let parsedJson: unknown;
  try {
    parsedJson = expandPackedCatalog(JSON.parse(await readJsonText(filePath)), schema);
  } catch (error) {
    throw new LibraryLoadError(filePath, "$", error instanceof Error ? error.message : String(error));
  }

  return parseJsonRecords(filePath, "$", parsedJson, schema);
}

function parseJsonRecords<S extends z.ZodTypeAny>(
  filePath: string,
  rootField: string,
  parsedJson: unknown,
  schema: S
): z.output<S>[] {
  if (Array.isArray(parsedJson)) {
    return parsedJson.map((item, index) =>
      parseJsonRecord(filePath, rootField === "$" ? `${index}` : `${rootField}.${index}`, item, schema)
    );
  }

  return [parseJsonRecord(filePath, rootField, parsedJson, schema)];
}

async function readJsonText(filePath: string): Promise<string> {
  const raw = await readFile(filePath);
  if (filePath.endsWith(".gz")) {
    return decompress(raw, gunzip);
  }

  if (filePath.endsWith(".br")) {
    return decompress(raw, brotliDecompress);
  }

  return raw.toString("utf8");
}

function expandPackedCatalog<S extends z.ZodTypeAny>(parsedJson: unknown, schema: S): unknown {
  if (schema === InterventionUnitSchema && Array.isArray(parsedJson) && parsedJson[0] === "u") {
    const [, hallmarks, citations, rows] = parsedJson;
    return requireRow(rows).map((row) => expandUnit(row, requireRow(hallmarks), requireRow(citations)));
  }

  if (!Array.isArray(parsedJson) || !Array.isArray(parsedJson[0])) {
    return parsedJson;
  }

  if (schema === InterventionUnitSchema) {
    return parsedJson.map((row) => expandUnit(row));
  }

  if (schema === ProtocolSchema) {
    return parsedJson.map(expandProtocol);
  }

  return parsedJson;
}

function expandUnit(row: unknown, hallmarks?: unknown[], citations?: unknown[]): Record<string, unknown> {
  return expandRow(UNIT_KEYS, row, {
    3: (value) => CATEGORIES[value as number],
    4: (value) => expandRow(CODES_KEYS, value),
    5: expandDose,
    6: expandTiming,
    7: (value) => expandRows(value, expandTarget),
    9: (value) => hallmarks ? unpackIndexes(value, hallmarks) : value,
    10: (value) =>
      expandRow(EVIDENCE_KEYS, value, {
        0: (value) => EVIDENCE_GRADES[value as number],
        3: (value) => citations ? unpackIndexes(value, citations) : value
      }),
    11: (value) => expandRow(INTERACTION_KEYS, value)
  });
}

function expandProtocol(row: unknown): Record<string, unknown> {
  const protocol = expandRow(PROTOCOL_KEYS, row, {
    4: (value) => {
      const intention = requireRow(value);
      return {
        primary_goal: intention[0],
        targets: expandRows(intention[1], expandTarget)
      };
    },
    3: (value) => CATEGORIES[value as number],
    5: (value) =>
      expandRows(value, (value) => {
        const action = expandRow("unit params condition", value);
        if (action.condition) {
          action.condition = unpackCondition(action.condition as string);
        }
        return action;
      })
  });

  if (protocol.applies_when) {
    protocol.applies_when = unpackCondition(protocol.applies_when as string);
  }

  return protocol;
}

function expandDose(value: unknown): Record<string, unknown> {
  return expandRow(DOSE_KEYS, value, {
    4: (range) => expandRow("min max step", range)
  });
}

function expandTiming(value: unknown): Record<string, unknown> {
  return expandRow(TIMING_KEYS, value, {
    6: (cycle) => expandRow("on_weeks off_weeks", cycle)
  });
}

function expandTarget(value: unknown): Record<string, unknown> {
  return expandRow(TARGET_KEYS, value, {
    1: (value) => DIRECTIONS[value as number]
  });
}

function expandRows(value: unknown, expand: (row: unknown) => unknown): unknown[] {
  return requireRow(value).map(expand);
}

function expandRow(
  keys: string,
  value: unknown,
  expand: Record<number, (value: unknown) => unknown> = {}
): Record<string, unknown> {
  const row = requireRow(value);
  const record: Record<string, unknown> = {};
  keys.split(" ").forEach((key, index) => {
    const item = row[index];
    if (item !== null && item !== undefined) {
      record[key] = expand[index]?.(item) ?? item;
    }
  });
  return record;
}

function requireRow(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid compact catalog row");
  }

  return value;
}

function unpackIndexes(value: unknown, dictionary: unknown[]): unknown[] {
  return requireRow(value).map((index) => dictionary[index as number]);
}

function unpackCondition(condition: string): string {
  return condition
    .replaceAll("&", " && ")
    .replaceAll("|", " || ")
    .replaceAll("!0", " != false")
    .replaceAll("=0", " == false")
    .replaceAll("!1", " != true")
    .replaceAll("=1", " == true")
    .replaceAll("@p", "user.pregnant")
    .replaceAll("@a", "user.age")
    .replaceAll("~", "user.flags.");
}

function decompress(
  raw: Buffer,
  decompressFn: typeof gunzip | typeof brotliDecompress
): Promise<string> {
  return new Promise((resolve, reject) => {
    decompressFn(raw, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result.toString("utf8"));
    });
  });
}

function parseJsonRecord<S extends z.ZodTypeAny>(
  filePath: string,
  rootField: string,
  parsedJson: unknown,
  schema: S
): z.output<S> {
  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    const issue = result.error.issues[0];
    const suffix = issue?.path.length ? issue.path.join(".") : "";
    const field = rootField === "$" ? suffix || "$" : suffix ? `${rootField}.${suffix}` : rootField;
    throw new LibraryLoadError(filePath, field, issue?.message ?? "Invalid data");
  }

  return result.data;
}
