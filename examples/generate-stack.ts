import { apply, loadLibrary, selectProtocols, UserProfileSchema } from "../src/index.js";

const library = await loadLibrary();

const protocols = selectProtocols(library, {
  ids: ["proto_blueprint_sleep", "proto_blueprint_exercise", "proto_blueprint_nutrition"]
});

const profile = UserProfileSchema.parse({
  user_id: "example_baseline",
  goal: "general_longevity",
  goal_pole: "baseline_blueprint",
  sex: "male",
  pregnant: false,
  conditions: [],
  medications: [],
  constraints: [],
  flags: {},
  biomarkers: {}
});

const stack = apply(protocols, profile, library);

console.log(
  JSON.stringify(
    {
      profile: {
        user_id: profile.user_id,
        goal: profile.goal
      },
      protocols: protocols.map((protocol) => protocol.id),
      unit_count: stack.units.length,
      evidence_summary: stack.evidence_summary,
      cost_per_month_usd: stack.cost_per_month_usd,
      review_required: stack.review_required,
      daily_slots: Object.keys(stack.schedule.daily).sort(),
      weekly_slots: Object.keys(stack.schedule.weekly).sort(),
      collisions: stack.validation.collisions
    },
    null,
    2
  )
);
