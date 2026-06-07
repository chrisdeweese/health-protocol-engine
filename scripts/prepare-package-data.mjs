import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants } from "node:zlib";

const CATEGORIES = "sleep nutrition exercise supplement pharmaceutical skin oral hair hydration light temperature breath stress measurement advanced_therapy".split(" ");
const DIRECTIONS = "up down neutral".split(" ");
const EVIDENCE_GRADES = "A B C D".split(" ");

await rm("dist/data", { recursive: true, force: true });
await mkdir("dist/data", { recursive: true });

const [units, protocols] = await Promise.all([
  readCatalog("data/units/catalog.json"),
  readCatalog("data/protocols/catalog.json")
]);

await writeFile("dist/data/catalog.json.br", compress([packProtocolsCatalog(protocols), packUnitsCatalog(units)]));

async function readCatalog(source) {
  return JSON.parse(await readFile(source, "utf8"));
}

function compress(value) {
  return brotliCompressSync(JSON.stringify(value), {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11
    }
  });
}

function packUnitsCatalog(units) {
  const hallmarks = dictionary(units.flatMap((unit) => unit.hallmarks));
  const citations = dictionary(units.flatMap((unit) => unit.evidence.citations));
  const hallmarkMap = indexMap(hallmarks);
  const citationMap = indexMap(citations);
  return [
    "u",
    hallmarks,
    citations,
    units.map((unit) => packUnit(unit, hallmarkMap, citationMap))
  ];
}

function packProtocolsCatalog(protocols) {
  return protocols.map(packProtocol);
}

function packUnit(unit, hallmarkMap, citationMap) {
  return trimNullTail([
    unit.id,
    unit.canonical_name,
    unit.aliases,
    CATEGORIES.indexOf(unit.category),
    packCodes(unit.codes),
    packDose(unit.dose),
    packTiming(unit.timing),
    unit.targets.map(packTarget),
    unit.mechanisms,
    unit.hallmarks.map((hallmark) => hallmarkMap.get(hallmark)),
    packEvidence(unit.evidence, citationMap),
    packInteractionKeys(unit.interaction_keys),
    unit.contraindications,
    unit.cost_per_month_usd,
    unit.burden_score
  ]);
}

function packProtocol(protocol) {
  return [
    protocol.id,
    protocol.name,
    protocol.source,
    CATEGORIES.indexOf(protocol.category),
    [protocol.intention.primary_goal, protocol.intention.targets.map(packTarget)],
    protocol.actions.map((action) => trimNullTail([action.unit, action.params, packCondition(action.condition)])),
    packCondition(protocol.applies_when),
    protocol.conflicts_with
  ];
}

function packCodes(codes) {
  return trimNullTail([
    codes.local ?? null,
    codes.fdc ?? null,
    codes.rxnorm ?? null,
    codes.loinc ?? null,
    codes.idisk ?? null,
    codes.snomed ?? null,
    codes.cpa ?? null,
    codes.unii ?? null
  ]);
}

function packDose(dose) {
  return trimNullTail([
    dose.value,
    dose.unit,
    dose.route,
    dose.scalable ? true : null,
    dose.range ? [dose.range.min, dose.range.max, dose.range.step] : null
  ]);
}

function packTiming(timing) {
  return trimNullTail([
    timing.frequency,
    timing.time_of_day,
    timing.with_food ?? null,
    timing.duration_min ?? null,
    timing.relative_to ?? null,
    timing.days_of_week ?? null,
    timing.cycle ? [timing.cycle.on_weeks, timing.cycle.off_weeks] : null
  ]);
}

function packTarget(target) {
  return trimNullTail([target.biomarker, DIRECTIONS.indexOf(target.direction), target.loinc ?? null]);
}

function packEvidence(evidence, citationMap) {
  return [EVIDENCE_GRADES.indexOf(evidence.grade), evidence.best_study, evidence.human_rct ? true : null, evidence.citations.map((citation) => citationMap.get(citation))];
}

function packInteractionKeys(keys) {
  return trimNullTail([keys.interaction_class ?? null, keys.rxnorm ?? null]);
}

function packCondition(condition) {
  return condition
    ?.replaceAll("user.flags.", "~")
    .replaceAll("user.age", "@a")
    .replaceAll("user.pregnant", "@p")
    .replaceAll(" == true", "=1")
    .replaceAll(" != true", "!1")
    .replaceAll(" == false", "=0")
    .replaceAll(" != false", "!0")
    .replaceAll(" && ", "&")
    .replaceAll(" || ", "|");
}

function dictionary(values) {
  return [...new Set(values)].sort();
}

function indexMap(values) {
  return new Map(values.map((value, index) => [value, index]));
}

function trimNullTail(row) {
  while (row.at(-1) === null) {
    row.pop();
  }
  return row;
}
