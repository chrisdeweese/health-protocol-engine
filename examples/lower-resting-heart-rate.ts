import { apply, loadLibrary, selectProtocols, UserProfileSchema } from "../src/index.js";

const library = await loadLibrary();

const profile = UserProfileSchema.parse({
  user_id: "example_lower_resting_hr",
  goal: "lower_resting_heart_rate",
  goal_pole: "autonomic_fitness_recovery",
  sex: "male",
  age: 42,
  pregnant: false,
  conditions: [],
  medications: [],
  constraints: [],
  flags: {
    cardiovascular_focus: true,
    performance_tracking: true,
    recovery_focus: true,
    heat_therapy_ok: true,
    stress_focus: true,
    hrv_focus: true,
    biofeedback_ok: true,
    insomnia: true,
    chronic_insomnia: true,
    sleep_efficiency_low: true,
    pre_sleep_arousal: true,
    low_impact_preferred: true,
    training_days: true
  },
  biomarkers: {
    resting_hr: 78
  }
});

const protocols = selectProtocols(library, {
  ids: [
    "proto_blueprint_sleep",
    "proto_blueprint_exercise",
    "proto_blueprint_nutrition",
    "proto_lifestyle_aerobic_menu",
    "proto_lifestyle_recovery_modalities",
    "proto_breath_autonomic_biofeedback",
    "proto_sleep_insomnia_behavioral_pharmacology"
  ],
  profile
});

const stack = apply(protocols, profile, library);

const relevantUnits = stack.units
  .filter((unit) =>
    unit.targets.some((target) =>
      ["resting_hr", "hrv", "heart_rate_variability", "vo2max", "sleep_efficiency"].includes(target.biomarker)
    )
  )
  .map((unit) => ({
    id: unit.id,
    name: unit.canonical_name,
    category: unit.category,
    evidence: unit.evidence.grade,
    frequency: unit.timing.frequency,
    time_of_day: unit.timing.time_of_day,
    targets: unit.targets
  }));

console.log(
  JSON.stringify(
    {
      input: {
        goal: profile.goal,
        age: profile.age,
        biomarkers: profile.biomarkers,
        enabled_flags: Object.entries(profile.flags)
          .filter(([, enabled]) => enabled)
          .map(([flag]) => flag)
          .sort()
      },
      result: {
        protocol_count: protocols.length,
        total_units: stack.units.length,
        relevant_units: relevantUnits,
        evidence_summary: stack.evidence_summary,
        cost_per_month_usd: stack.cost_per_month_usd,
        review_required: stack.review_required,
        daily_slots: Object.fromEntries(
          Object.entries(stack.schedule.daily)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([slot, units]) => [slot, units.map((unit) => unit.unit_id)])
        ),
        weekly_slots: Object.fromEntries(
          Object.entries(stack.schedule.weekly)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([slot, units]) => [slot, units.map((unit) => unit.unit_id)])
        ),
        collisions: stack.validation.collisions
      }
    },
    null,
    2
  )
);
