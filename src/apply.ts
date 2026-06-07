import { evaluateCondition } from "./conditions.js";
import type { InterventionLibrary } from "./library.js";
import {
  Collision,
  EvidenceGrade,
  EvidenceSummary,
  InterventionUnit,
  PersonalizedStack,
  PersonalizedStackSchema,
  Protocol,
  Schedule,
  ScheduledUnit,
  UserProfileInput,
  UserProfileSchema
} from "./schemas.js";
import { validateSafety } from "./safety.js";

type ResolvedUnit = {
  unit: InterventionUnit;
  protocolIds: Set<string>;
};

export function apply(protocols: Protocol[], rawProfile: UserProfileInput, library: InterventionLibrary): PersonalizedStack {
  const profile = UserProfileSchema.parse(rawProfile);
  const resolved = new Map<string, ResolvedUnit>();

  for (const protocol of protocols) {
    if (!evaluateCondition(protocol.applies_when, profile)) {
      continue;
    }

    for (const action of protocol.actions) {
      if (!evaluateCondition(action.condition, profile)) {
        continue;
      }

      const unit = library.getUnit(action.unit);
      if (!unit) {
        throw new Error(`Protocol "${protocol.id}" references unknown unit "${action.unit}"`);
      }

      const existing = resolved.get(unit.id);
      if (existing) {
        existing.protocolIds.add(protocol.id);
      } else {
        resolved.set(unit.id, { unit, protocolIds: new Set([protocol.id]) });
      }
    }
  }

  const units = [...resolved.values()].map((entry) => entry.unit);
  const collisions = collectCollisions(resolved);
  const validation = { ...validateSafety(units, profile), collisions };
  const schedule = buildSchedule(resolved);
  const stack: PersonalizedStack = {
    user_id: profile.user_id,
    generated_at: new Date().toISOString(),
    goal_pole: profile.goal_pole,
    units,
    schedule,
    validation,
    evidence_summary: summarizeEvidence(units),
    cost_per_month_usd: sumCosts(units),
    review_required: units.some((unit) => unit.category === "pharmaceutical")
  };

  return PersonalizedStackSchema.parse(stack);
}

function collectCollisions(resolved: Map<string, ResolvedUnit>): Collision[] {
  return [...resolved.entries()]
    .filter(([, entry]) => entry.protocolIds.size > 1)
    .map(([unitId, entry]) => ({
      unit_id: unitId,
      protocols: [...entry.protocolIds].sort(),
      resolution: "deduped canonical unit by id"
    }));
}

function buildSchedule(resolved: Map<string, ResolvedUnit>): Schedule {
  const schedule: Schedule = { daily: {}, weekly: {} };
  const entries = [...resolved.values()].sort((a, b) => a.unit.id.localeCompare(b.unit.id));

  for (const entry of entries) {
    const scheduledUnit: ScheduledUnit = {
      unit_id: entry.unit.id,
      name: entry.unit.canonical_name,
      category: entry.unit.category,
      dose: entry.unit.dose,
      timing: entry.unit.timing,
      protocol_ids: [...entry.protocolIds].sort()
    };

    const cadence = isWeekly(entry.unit.timing.frequency) ? schedule.weekly : schedule.daily;
    const key = entry.unit.timing.time_of_day;
    (cadence[key] ??= []).push(scheduledUnit);
  }

  return schedule;
}

function isWeekly(frequency: string): boolean {
  return /week/i.test(frequency) && !/day|daily/i.test(frequency);
}

function summarizeEvidence(units: InterventionUnit[]): EvidenceSummary {
  const summary: Record<EvidenceGrade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const unit of units) {
    summary[unit.evidence.grade] += 1;
  }
  return summary;
}

function sumCosts(units: InterventionUnit[]): number {
  return Number(units.reduce((total, unit) => total + unit.cost_per_month_usd, 0).toFixed(2));
}
