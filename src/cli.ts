#!/usr/bin/env node
import { apply, loadLibrary, UserProfileSchema } from "./index.js";

const library = await loadLibrary();
const profile = UserProfileSchema.parse({
  user_id: "u_blueprint_stage1",
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

const stack = apply(library.allProtocols(), profile, library);
console.log(JSON.stringify(stack, null, 2));
