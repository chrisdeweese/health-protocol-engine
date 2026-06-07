import type { InterventionUnit, UserProfile, Validation } from "./schemas.js";

type Interaction = Validation["interactions"][number];
type Redundancy = Validation["redundancies"][number];
type Blocked = Validation["blocked"][number];
type Severity = Interaction["severity"];

const INTERACTION_GROUPS: Array<[string, string, Severity]> = [
  [
    "bleeding_risk",
    " acute_bleeding anticoagulant anticoagulation_caution antiplatelet bleeding_risk dual_antiplatelet gi_bleeding_risk major_bleeding nsaid ",
    "major"
  ],
  ["glucose_lowering", " glucose_lowering glucose_lowering_supplement ", "moderate"],
  ["hyperkalemia", " hyperkalemia_risk potassium potassium_sparing_diuretic ", "moderate"],
  ["hypotension", " antihypertensive bradycardia_hypotension hypotension_risk orthostatic_hypotension ", "moderate"],
  ["immunosuppression", " immunomodulator immunosuppression immunosuppressive live_vaccine ", "major"],
  ["qt_prolongation", " qt_caution qt_prolongation qt_prolongation_possible ", "major"],
  [
    "sedation",
    " antihistamine_sedation benzodiazepine controlled_substance opioid sedating_medication sedating_supplement sedation sedative sedative_hypnotic ",
    "major"
  ],
  ["serotonergic", " serotonergic ", "major"]
];

const REDUNDANCY_CLASSES =
  " behavioral_sleep blood_pressure_monitoring botanical_supplement breathwork exercise_aerobic exercise_resistance glucose_monitoring high_fiber_food light_exposure mineral_supplement sleep_monitoring uv_protection ";

export function validateSafety(units: InterventionUnit[], profile?: UserProfile): Omit<Validation, "collisions"> {
  return {
    interactions: collectInteractions(units),
    redundancies: collectRedundancies(units),
    intention_conflicts: [],
    blocked: profile ? collectBlocked(units, profile) : []
  };
}

function collectInteractions(units: InterventionUnit[]): Interaction[] {
  const interactions: Interaction[] = [];
  const seenPairs = new Set<string>();

  for (const [groupName, classes, severity] of INTERACTION_GROUPS) {
    const matchingUnits = units
      .filter((unit) => hasAnyClass(unit, classes))
      .sort((left, right) => left.id.localeCompare(right.id));

    forEachPair(matchingUnits, (left, right) => {
      addInteraction(interactions, seenPairs, {
        severity,
        pair: orderedPair(left.id, right.id),
        note: `shared ${groupName} interaction class; clinician review recommended`
      });
    });
  }

  for (const [rxnorm, matchingUnits] of groupBy(units, (unit) => unit.interaction_keys.rxnorm).entries()) {
    if (!rxnorm || matchingUnits.length < 2) continue;

    forEachPair(matchingUnits.sort((left, right) => left.id.localeCompare(right.id)), (left, right) => {
      addInteraction(interactions, seenPairs, {
        severity: "moderate",
        pair: orderedPair(left.id, right.id),
        note: `duplicate RxNorm key ${rxnorm}; review duplicate medication intent`
      });
    });
  }

  return interactions.sort(compareInteractions);
}

function collectRedundancies(units: InterventionUnit[]): Redundancy[] {
  const redundancies: Redundancy[] = [];

  for (const [interactionClass, matchingUnits] of groupByClasses(units).entries()) {
    if (!REDUNDANCY_CLASSES.includes(` ${interactionClass} `) || matchingUnits.length < 2) {
      continue;
    }

    redundancies.push({
      mode: interactionClass,
      units: matchingUnits.map((unit) => unit.id).sort()
    });
  }

  return redundancies.sort((left, right) => left.mode.localeCompare(right.mode));
}

function collectBlocked(units: InterventionUnit[], profile: UserProfile): Blocked[] {
  const profileTokens = collectProfileTokens(profile);
  const blocked: Blocked[] = [];

  for (const unit of [...units].sort((left, right) => left.id.localeCompare(right.id))) {
    const contraindication = unit.contraindications.find((item) =>
      contraindicationMatchesProfile(normalize(item), profileTokens)
    );

    if (contraindication) {
      blocked.push({
        unit: unit.id,
        reason: `matched contraindication "${contraindication}"`
      });
    }
  }

  return blocked;
}

function addInteraction(interactions: Interaction[], seenPairs: Set<string>, interaction: Interaction): void {
  const key = `${interaction.pair[0]}\0${interaction.pair[1]}\0${interaction.note}`;
  if (seenPairs.has(key)) {
    return;
  }

  seenPairs.add(key);
  interactions.push(interaction);
}

function hasAnyClass(unit: InterventionUnit, interactionClasses: string): boolean {
  return (
    unit.interaction_keys.interaction_class?.some((interactionClass) =>
      interactionClasses.includes(` ${interactionClass} `)
    ) ??
    false
  );
}

function groupBy<T>(items: T[], keyFor: (item: T) => string | undefined): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;

    addGrouped(grouped, key, item);
  }

  return grouped;
}

function groupByClasses(units: InterventionUnit[]): Map<string, InterventionUnit[]> {
  const grouped = new Map<string, InterventionUnit[]>();

  for (const unit of units) {
    for (const interactionClass of unit.interaction_keys.interaction_class ?? []) {
      addGrouped(grouped, interactionClass, unit);
    }
  }

  return grouped;
}

function addGrouped<T>(grouped: Map<string, T[]>, key: string, item: T): void {
  grouped.get(key)?.push(item) ?? grouped.set(key, [item]);
}

function forEachPair<T>(items: T[], onPair: (left: T, right: T) => void): void {
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    const left = items[leftIndex]!;

    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      onPair(left, items[rightIndex]!);
    }
  }
}

function orderedPair(left: string, right: string): [string, string] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left];
}

function compareInteractions(left: Interaction, right: Interaction): number {
  return (
    severityRank(right.severity) - severityRank(left.severity) ||
    left.pair[0].localeCompare(right.pair[0]) ||
    left.pair[1].localeCompare(right.pair[1]) ||
    left.note.localeCompare(right.note)
  );
}

function severityRank(severity: Severity): number {
  return severity === "major" ? 3 : severity === "moderate" ? 2 : 1;
}

function collectProfileTokens(profile: UserProfile): Set<string> {
  const tokens = new Set<string>();

  if (profile.pregnant) {
    tokens.add("pregnancy");
    tokens.add("current_pregnancy");
  }

  for (const item of [...profile.conditions, ...profile.constraints, ...profile.medications]) {
    addTokenVariants(tokens, item);
  }

  for (const [flag, enabled] of Object.entries(profile.flags)) {
    if (enabled) {
      addTokenVariants(tokens, flag);
    }
  }

  return tokens;
}

function addTokenVariants(tokens: Set<string>, value: string): void {
  const token = normalize(value);
  if (!token) return;

  tokens.add(token);
  tokens.add(`${token}_use`);
  tokens.add(`${token}_caution`);
  tokens.add(`${token}_without_guidance`);
  tokens.add(`${token}_use_without_guidance`);
}

function contraindicationMatchesProfile(contraindication: string, profileTokens: Set<string>): boolean {
  if (profileTokens.has(contraindication)) {
    return true;
  }

  for (const token of profileTokens) {
    if (token.length >= 4 && contraindication.includes(token)) {
      return true;
    }
  }

  return false;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
