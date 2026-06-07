import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  apply,
  composeStack,
  createProtocolEngine,
  InterventionLibrary,
  InterventionUnit,
  InterventionUnitSchema,
  LibraryLoadError,
  loadLibrary,
  PersonalizedStackSchema,
  Protocol,
  selectProtocols,
  UserProfileSchema,
  validateSafety
} from "../src/index.js";

const baseProfile = UserProfileSchema.parse({
  user_id: "u_test",
  goal: "general_longevity",
  goal_pole: "baseline_blueprint",
  sex: "male" as const
});

function stackUnitIds(stack: { units: { id: string }[] }): string[] {
  return stack.units.map((unit) => unit.id);
}

function protocolIds(protocols: { id: string }[]): string[] {
  return protocols.map((protocol) => protocol.id);
}

async function catalogIds(relativePath: string): Promise<string[]> {
  const records = JSON.parse(await readFile(path.join(process.cwd(), relativePath), "utf8")) as Array<{ id: string }>;
  return records.map((record) => record.id);
}

function scheduledIds(units: { unit_id: string }[] | undefined): string[] {
  return (units ?? []).map((unit) => unit.unit_id);
}

function expectScheduledContains(units: { unit_id: string }[] | undefined, id: string): void {
  expect(scheduledIds(units)).toContain(id);
}

function expectScheduledIncludes(units: { unit_id: string }[] | undefined, ids: string[]): void {
  expect(scheduledIds(units)).toEqual(expect.arrayContaining(ids));
}

function expectScheduledExact(units: { unit_id: string }[] | undefined, ids: string[]): void {
  expect(scheduledIds(units)).toEqual(ids);
}

function flagSet(enabled: string, overrides: Record<string, boolean> = {}): Record<string, boolean> {
  return {
    ...Object.fromEntries(enabled.split(" ").map((flag) => [flag, true])),
    ...overrides
  };
}

function hasCategory(stack: { units: { category: string }[] }, category: string): boolean {
  return stack.units.some((unit) => unit.category === category);
}

function expectCategory(stack: { units: { category: string }[] }, category: string, present = true): void {
  expect(hasCategory(stack, category)).toBe(present);
}

function expectStackUnits(stack: { units: { id: string }[] }, ids: string[]): void {
  expect(stackUnitIds(stack)).toEqual(expect.arrayContaining(ids));
}

function expectUnitPresent(stack: { units: { id: string }[] }, id: string): void {
  expect(stackUnitIds(stack)).toContain(id);
}

function expectUnitAbsent(stack: { units: { id: string }[] }, id: string): void {
  expect(stackUnitIds(stack)).not.toContain(id);
}

function expectProtocolIdsInclude(protocols: { id: string }[], ids: string[]): void {
  expect(protocolIds(protocols)).toEqual(expect.arrayContaining(ids));
}

function expectProtocolIdsExact(protocols: { id: string }[], ids: string[]): void {
  expect(protocolIds(protocols)).toEqual(ids);
}

function expectProtocolPresent(protocols: { id: string }[], id: string): void {
  expect(protocolIds(protocols)).toContain(id);
}

function expectProtocolAbsent(protocols: { id: string }[], id: string): void {
  expect(protocolIds(protocols)).not.toContain(id);
}

function unitCount(stack: { units: { id: string }[] }, id: string): number {
  return stack.units.filter((unit) => unit.id === id).length;
}

describe("Intervention Engine Stage 1", () => {
  let library: InterventionLibrary;

  beforeAll(async () => {
    library = await loadLibrary(process.cwd());
  });

  function applyTest(protocols: Protocol[], profile = baseProfile) {
    return apply(protocols, profile, library);
  }

  it("rejects a unit with zero standard codes", () => {
    const result = InterventionUnitSchema.safeParse({
      id: "iv_invalid",
      canonical_name: "Invalid unit",
      aliases: [],
      category: "sleep",
      codes: {},
      dose: { value: 1, unit: "routine", route: "behavioral", scalable: false },
      timing: { frequency: "1x/day", time_of_day: "night" },
      targets: [],
      mechanisms: ["test"],
      hallmarks: [],
      evidence: {
        grade: "B",
        best_study: "Test",
        human_rct: false,
        citations: []
      },
      interaction_keys: {},
      contraindications: [],
      cost_per_month_usd: 0,
      burden_score: 1
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["codes"]);
    }
  });

  it("rejects a missing evidence grade without defaulting", () => {
    const result = InterventionUnitSchema.safeParse({
      id: "iv_invalid",
      canonical_name: "Invalid unit",
      aliases: [],
      category: "sleep",
      codes: { local: "test" },
      dose: { value: 1, unit: "routine", route: "behavioral", scalable: false },
      timing: { frequency: "1x/day", time_of_day: "night" },
      targets: [],
      mechanisms: ["test"],
      hallmarks: [],
      evidence: {
        best_study: "Test",
        human_rct: false,
        citations: []
      },
      interaction_keys: {},
      contraindications: [],
      cost_per_month_usd: 0,
      burden_score: 1
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "evidence.grade")).toBe(true);
    }
  });

  it("names the file and field when the library loader rejects invalid data", async () => {
    const root = await createInvalidLibraryFixture();

    await expect(loadLibrary(root)).rejects.toMatchObject({
      name: "LibraryLoadError",
      field: "codes"
    } satisfies Partial<LibraryLoadError>);
  });

  it("loads every seed catalog record", async () => {
    const units = library.allUnits();
    const protocols = library.allProtocols();

    expect(units.map((unit) => unit.id)).toEqual(await catalogIds("data/units/catalog.json"));
    expect(protocolIds(protocols)).toEqual(await catalogIds("data/protocols/catalog.json"));
    expect(units.length).toBeGreaterThanOrEqual(1302);
    expect(protocols.length).toBeGreaterThanOrEqual(246);
    expect(new Set(units.map((unit) => unit.category)).size).toBeGreaterThanOrEqual(5);
    expect(library.getUnitsByMechanism("nad_precursor").map((unit) => unit.id)).toContain("iv_nmn");
    expect(library.getUnitsByCategory("temperature").map((unit) => unit.id)).toContain("iv_sauna");
  });

  it("loads the default bundled library path", async () => {
    const library = await loadLibrary();

    expect(library.allUnits().length).toBeGreaterThanOrEqual(1302);
    expect(library.getProtocol("proto_blueprint_sleep")).toBeDefined();
  });

  it("loads gzip-compressed JSON catalog files", async () => {
    const root = await createGzipLibraryFixture();
    const library = await loadLibrary(root);

    expect(library.getUnit("iv_gzip_fixture")?.canonical_name).toBe("Gzip fixture");
    expect(library.getProtocol("proto_gzip_fixture")?.actions[0]?.unit).toBe("iv_gzip_fixture");
  });

  it("loads brotli-compressed JSON catalog files", async () => {
    const root = await createBrotliLibraryFixture();
    const library = await loadLibrary(root);

    expect(library.getUnit("iv_brotli_fixture")?.canonical_name).toBe("Brotli fixture");
    expect(library.getProtocol("proto_brotli_fixture")?.actions[0]?.unit).toBe("iv_brotli_fixture");
  });

  it("supports bulk JSON library files and optional profile conditions", async () => {
    const physicalActivity = requiredProtocol(library, "proto_guideline_physical_activity");

    const younger = applyTest([physicalActivity]);
    expectUnitAbsent(younger, "iv_balance_training");

    const older = applyTest([physicalActivity], { ...baseProfile, age: 65 });
    expectUnitPresent(older, "iv_balance_training");
  });

  it("applies preventive screening conditions and flips review for vaccines", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_preventive_cancer_screening",
      "proto_preventive_adult_immunization"
    );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 52,
        sex: "female",
        flags: flagSet("lung_screening_eligible colonoscopy_due")
      }
    );
    expectStackUnits(stack, [
      "iv_colorectal_fit_screening",
      "iv_screening_colonoscopy",
      "iv_mammography_screening",
      "iv_cervical_cytology_screening",
      "iv_high_risk_hpv_screening",
      "iv_lung_ldct_screening",
      "iv_influenza_vaccination",
      "iv_covid_vaccination",
      "iv_zoster_vaccination",
      "iv_pneumococcal_vaccination"
    ]);
    expect(stack.review_required).toBe(true);
  });

  it("applies supplement batch conditions without pharmaceutical review", async () => {
    const protocols = protocolsByPrefix(library, "proto_supplement_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        goal: "muscle_gain",
        flags: flagSet("iron_deficiency protein_low performance_tracking caffeine_ok glucose_focus stress_focus longevity_experimental_ok")
      }
    );
    expectStackUnits(stack, [
      "iv_iron_bisglycinate",
      "iv_whey_protein_isolate",
      "iv_beta_alanine",
      "iv_citrulline_malate",
      "iv_caffeine_supplement",
      "iv_berberine",
      "iv_l_theanine",
      "iv_phosphatidylserine",
      "iv_spermidine",
      "iv_sulforaphane_broccoli_sprout"
    ]);
    expect(stack.review_required).toBe(false);
  });

  it("applies lifestyle and recovery batch conditions without pharmaceutical review", async () => {
    const protocols = protocolsByPrefix(library, "proto_lifestyle_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 66,
        flags: flagSet("glucose_focus low_impact_preferred performance_tracking nature_focus home_training mobility_focus recovery_focus cold_exposure_ok heat_therapy_ok stress_focus sleep_focus insomnia nicotine_user")
      }
    );
    expectStackUnits(stack, [
      "iv_cycling_aerobic",
      "iv_postprandial_walk",
      "iv_water_aerobics",
      "iv_rowing_machine",
      "iv_resistance_band_training",
      "iv_static_stretching",
      "iv_mobility_flow",
      "iv_active_recovery",
      "iv_foam_rolling",
      "iv_cold_water_immersion",
      "iv_hot_bath_heat_therapy",
      "iv_slow_breathing",
      "iv_progressive_muscle_relaxation",
      "iv_nature_exposure",
      "iv_stimulus_control_sleep",
      "iv_sleep_screen_curfew",
      "iv_nap_limit",
      "iv_nicotine_sleep_cutoff"
    ]);
    expectCategory(stack, "breath");
    expect(stack.review_required).toBe(false);
  });

  it("applies nutrition metabolic batch conditions without pharmaceutical review", async () => {
    const protocols = protocolsByPrefix(library, "proto_nutrition_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        goal: "weight_loss",
        age: 58,
        sex: "female",
        flags: flagSet("low_fruit_vegetable_intake prebiotic_focus cooking_at_home mediterranean_focus ultra_processed_focus ldl_focus cardiovascular_focus hypertension_focus glucose_focus added_sugar_focus microbiome_focus fiber_focus protein_focus dairy_ok plant_protein_focus early_tre_ok")
      }
    );
    expectStackUnits(stack, [
      "iv_leafy_greens",
      "iv_cruciferous_vegetables",
      "iv_berry_serving",
      "iv_oat_beta_glucan",
      "iv_ground_flaxseed",
      "iv_saturated_fat_swap",
      "iv_trans_fat_avoidance",
      "iv_salt_substitute_potassium_chloride",
      "iv_sugar_sweetened_beverage_avoidance",
      "iv_added_sugar_cap",
      "iv_ultra_processed_food_reduction",
      "iv_early_time_restricted_eating",
      "iv_calorie_deficit_if_weight_loss_goal",
      "iv_fiber_ramp",
      "iv_kefir_unsweetened",
      "iv_sauerkraut_kimchi",
      "iv_breakfast_protein_anchor",
      "iv_tofu_tempeh_soy"
    ]);
    expectCategory(stack, "hydration");
    expect(stack.review_required).toBe(false);
  });

  it("applies environment prevention batch conditions without pharmaceutical review", async () => {
    const protocols = protocolsByPrefix(library, "proto_environment_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 63,
        flags: flagSet("air_quality_focus wildfire_smoke_region outdoor_air_clean cooking_at_home gas_stove visible_mold radon_high generator_use old_home lead_service_line_possible water_quality_focus pfas_water_concern loud_noise_exposure very_high_noise_exposure headphone_use hearing_concern outdoor_time skin_cancer_high_risk dry_skin photoaging_focus oral_care_upgrade caries_risk dry_mouth bruxism")
      }
    );
    expectStackUnits(stack, [
      "iv_daily_aqi_check",
      "iv_hepa_air_purifier_bedroom",
      "iv_merv13_hvac_filtration",
      "iv_wildfire_clean_air_room",
      "iv_cooking_ventilation_range_hood",
      "iv_radon_home_test",
      "iv_radon_mitigation_if_high",
      "iv_carbon_monoxide_detector",
      "iv_lead_paint_dust_control",
      "iv_lead_water_testing",
      "iv_nsf_lead_water_filter",
      "iv_pfas_water_filter",
      "iv_hearing_protection_earplugs",
      "iv_double_hearing_protection_high_noise",
      "iv_headphone_volume_limit",
      "iv_uv_index_check",
      "iv_upf_clothing_hat",
      "iv_sunscreen_reapplication",
      "iv_avoid_indoor_tanning",
      "iv_topical_retinoid_photoaging",
      "iv_electric_toothbrush",
      "iv_professional_fluoride_varnish",
      "iv_night_guard_bruxism"
    ]);
    expectCategory(stack, "hydration");
    expectCategory(stack, "oral");
    expectCategory(stack, "skin");
    expect(stack.review_required).toBe(false);
  });

  it("applies clinician-managed therapy batch with pharmaceutical review and clinical collisions", async () => {
    const protocols = protocolsByPrefix(library, "proto_clinical_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 62,
        flags: flagSet("clinician_managed primary_prevention_statin_candidate ascvd established_cvd very_high_ascvd_risk additional_ldl_lowering_needed hypertriglyceridemia secondary_prevention_ascvd hypertension_diagnosis ckd_albuminuria additional_bp_agent_needed resistant_hypertension type2_diabetes metformin_candidate ckd heart_failure high_ascvd_risk obesity obesity_pharmacotherapy_candidate weight_related_condition osa_diagnosed moderate_severe_osa cpap_intolerant positional_osa tobacco_user nrt_ok varenicline_ok bupropion_ok osteoporosis_diagnosis oral_bisphosphonate_ok high_fracture_risk very_high_fracture_risk")
      }
    );
    expectStackUnits(stack, [
      "iv_moderate_intensity_statin",
      "iv_high_intensity_statin",
      "iv_ezetimibe",
      "iv_pcsk9_monoclonal_antibody",
      "iv_icosapent_ethyl",
      "iv_thiazide_like_diuretic",
      "iv_angiotensin_receptor_blocker",
      "iv_sglt2_inhibitor_cardiorenal",
      "iv_glp1_receptor_agonist_cv",
      "iv_tirzepatide_metabolic_therapy",
      "iv_pap_therapy_osa",
      "iv_custom_mandibular_advancement_device",
      "iv_nicotine_replacement_combination",
      "iv_varenicline",
      "iv_oral_bisphosphonate",
      "iv_anabolic_osteoporosis_therapy"
    ]);
    expect(unitCount(stack, "iv_tirzepatide_metabolic_therapy")).toBe(1);
    expect(stack.validation.collisions).toContainEqual({
      unit_id: "iv_tirzepatide_metabolic_therapy",
      protocols: [
      "proto_clinical_diabetes_cardiorenal_management",
      "proto_clinical_obesity_cardiometabolic_management",
      "proto_clinical_sleep_apnea_management"
      ],
      resolution: "deduped canonical unit by id"
    });
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("applies behavioral health and addiction batch with psychotherapy, safety, and medication review", async () => {
    const protocols = protocolsByPrefix(library, "proto_behavioral_health_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 44,
        flags: flagSet("clinician_managed mental_health_screening depression_focus major_depression anhedonia relationship_stressor practical_stressors antidepressant_candidate pain_comorbidity fatigue_anhedonia insomnia treatment_resistant_depression anxiety_focus gad somatic_tension panic_disorder social_anxiety avoidance_focus partial_response ptsd trauma_focused_therapy exposure_ready emdr_preferred ptsd_medication_candidate suicide_risk lethal_means_access substance_use_screening alcohol_user risky_drinking alcohol_use_disorder abstinence_goal supervised_disulfiram_candidate peer_support_ok opioid_exposure opioid_use_disorder overdose_risk buprenorphine_candidate methadone_candidate stimulant_use_disorder contingency_management_available")
      }
    );
    expectStackUnits(stack, [
      "iv_phq9_depression_monitoring",
      "iv_gad7_anxiety_monitoring",
      "iv_audit_c_alcohol_screen",
      "iv_safety_plan_suicide_risk",
      "iv_lethal_means_safety_counseling",
      "iv_cbt_depression",
      "iv_behavioral_activation",
      "iv_cbt_anxiety",
      "iv_exposure_therapy_panic_social",
      "iv_cognitive_processing_therapy_ptsd",
      "iv_prolonged_exposure_ptsd",
      "iv_emdr_ptsd",
      "iv_ssri_firstline_mood_anxiety",
      "iv_snri_mood_anxiety_pain",
      "iv_bupropion_depression",
      "iv_transcranial_magnetic_stimulation_depression",
      "iv_naltrexone_alcohol_use_disorder",
      "iv_acamprosate_alcohol_use_disorder",
      "iv_naloxone_overdose_rescue",
      "iv_buprenorphine_oud",
      "iv_methadone_otp_oud",
      "iv_contingency_management_sud"
    ]);
    expectCategory(stack, "stress");
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes ADHD, OCD, bipolar, psychosis, and SMI recovery protocols with medication safety", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_behavioral_health_adhd_diagnosis_management",
      "proto_behavioral_health_ocd_bdd_erp_pharmacology",
      "proto_behavioral_health_bipolar_mood_stabilization_safety",
      "proto_behavioral_health_psychosis_schizophrenia_early_episode",
      "proto_behavioral_health_smi_metabolic_function_recovery"
    );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 32,
        sex: "female",
        pregnant: false,
        flags: flagSet("clinician_managed adhd adhd_suspected adult_adhd inattention_impairment hyperactivity_impulsivity executive_dysfunction organizational_impairment work_impairment school_impairment accommodations_needed stimulant_candidate lisdexamfetamine_adhd_candidate nonstimulant_candidate stimulant_not_tolerated adhd_medication substance_use_risk ocd bdd obsessions_compulsions family_available family_accommodation reassurance_seeking ssri_candidate moderate_severe_ocd ssri_nonresponse clomipramine_candidate bipolar_disorder mania hypomania reduced_sleep risky_behavior relapse_prevention_focus psychotherapy_preferred lithium_candidate lithium_use bipolar_depression lamotrigine_candidate valproate_candidate psychosis antipsychotic_candidate antipsychotic_use schizophrenia first_episode_psychosis early_psychosis delusions_hallucinations distressing_voices treatment_resistant_psychosis clozapine_candidate recurrent_suicidality lai_preferred nonadherence_relapse long_acting_injectable_candidate functional_recovery_goal smi metabolic_syndrome weight_gain hypertension_focus frequent_hospitalization poor_engagement homelessness_risk high_service_need smoking nrt_candidate suicide_risk crisis_safety_plan_needed", { childbearing_potential: false })
      }
    );
    expect(stack.units.length).toBeGreaterThanOrEqual(39);
    expectStackUnits(stack, [
      "iv_adhd_specialist_diagnostic_assessment",
      "iv_adhd_rating_scale_function_monitoring",
      "iv_adhd_cardiovascular_growth_sleep_appetite_monitoring",
      "iv_methylphenidate_adhd",
      "iv_lisdexamfetamine_adhd",
      "iv_atomoxetine_adhd",
      "iv_ybocs_ocd_severity_monitoring",
      "iv_ocd_exposure_response_prevention_cbt",
      "iv_ocd_ssri_pharmacotherapy",
      "iv_clomipramine_ocd",
      "iv_mania_hypomania_safety_sleep_substance_triage",
      "iv_lithium_level_renal_thyroid_monitoring",
      "iv_lithium_bipolar_mood_stabilizer",
      "iv_lamotrigine_bipolar_depression_maintenance",
      "iv_valproate_bipolar_mania_teratogen_review",
      "iv_psychosis_medical_substance_secondary_cause_assessment",
      "iv_first_episode_psychosis_coordinated_specialty_care",
      "iv_antipsychotic_metabolic_movement_monitoring",
      "iv_second_generation_antipsychotic_psychosis_bipolar",
      "iv_clozapine_treatment_resistant_schizophrenia_monitoring",
      "iv_long_acting_injectable_antipsychotic",
      "iv_cbt_for_psychosis",
      "iv_family_intervention_psychosis",
      "iv_assertive_community_treatment_smi",
      "iv_supported_employment_education_smi"
    ]);
    expect(unitCount(stack, "iv_antipsychotic_metabolic_movement_monitoring")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_antipsychotic_metabolic_movement_monitoring",
          protocols: [
            "proto_behavioral_health_bipolar_mood_stabilization_safety",
            "proto_behavioral_health_psychosis_schizophrenia_early_episode",
            "proto_behavioral_health_smi_metabolic_function_recovery"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_second_generation_antipsychotic_psychosis_bipolar",
          protocols: [
            "proto_behavioral_health_bipolar_mood_stabilization_safety",
            "proto_behavioral_health_psychosis_schizophrenia_early_episode"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_supported_employment_education_smi",
          protocols: [
            "proto_behavioral_health_psychosis_schizophrenia_early_episode",
            "proto_behavioral_health_smi_metabolic_function_recovery"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledIncludes(stack.schedule.daily.urgent_visit, [
      "iv_mania_hypomania_safety_sleep_substance_triage",
      "iv_psychosis_medical_substance_secondary_cause_assessment"
    ]);
    expectScheduledIncludes(stack.schedule.weekly.scheduled_session, ["iv_ocd_exposure_response_prevention_cbt", "iv_cbt_for_psychosis"]);
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes autism and intellectual disability supports with access, behavior, and medication guardrails", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_neurodevelopment_autism_diagnosis_postdiagnostic",
      "proto_neurodevelopment_autism_child_early_intervention_school",
      "proto_neurodevelopment_autism_adult_health_employment",
      "proto_neurodevelopment_autism_idd_behavior_safety_medication",
      "proto_neurodevelopment_learning_disability_health_access"
    );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 17,
        sex: "unknown",
        flags: flagSet("clinician_managed autism autism_suspected autism_assessment_requested new_autism_diagnosis support_needs_assessment adaptive_function_concern communication_difficulty language_delay aac_needed sensory_overload environmental_adjustments_needed school_sensory_barrier school_support_needed iep_needed transition_planning_needed daily_living_support_needed ot_needed family_training_needed social_communication_support_needed social_skills_group_desired autistic_adult reasonable_adjustments_needed healthcare_access_barrier healthcare_communication_barrier employment_support_needed work_impairment job_coaching_needed cooccurring_conditions mental_health_concern learning_disability intellectual_disability idd behavior_challenges self_injury aggression rapid_escalation sudden_behavior_change positive_behavior_support_needed environmental_triggers crisis_safety_plan_needed suicide_risk severe_irritability severe_aggression severe_self_injury psychosocial_insufficient antipsychotic_use autism_antipsychotic_candidate screening_access_barrier dysphagia malnutrition_risk dental_access_barrier carer_support_needed caregiver_burden")
      }
    );
    expect(stack.units.length).toBeGreaterThanOrEqual(27);
    expectStackUnits(stack, [
      "iv_autism_aq10_adult_screen",
      "iv_autism_comprehensive_diagnostic_assessment",
      "iv_autism_post_diagnostic_followup_support_plan",
      "iv_autism_communication_profile_aac_assessment",
      "iv_speech_language_therapy_autism_communication",
      "iv_autism_parent_mediated_social_communication_intervention",
      "iv_autism_school_iep_transition_support",
      "iv_autism_healthcare_reasonable_adjustments_passport",
      "iv_autism_sleep_gi_seizure_pain_review",
      "iv_autism_challenging_behavior_functional_assessment",
      "iv_positive_behavior_support_plan_idd_autism",
      "iv_autism_crisis_safety_plan_behavior_escalation",
      "iv_autism_antipsychotic_irritability_review",
      "iv_antipsychotic_metabolic_movement_monitoring",
      "iv_learning_disability_annual_health_check_action_plan",
      "iv_learning_disability_reasonable_adjustments_record",
      "iv_learning_disability_screening_access_navigation",
      "iv_learning_disability_dysphagia_nutrition_oral_review",
      "iv_learning_disability_carer_needs_support_assessment"
    ]);
    expect(unitCount(stack, "iv_autism_sensory_profile_environment_adjustment")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_autism_communication_profile_aac_assessment",
          protocols: [
            "proto_neurodevelopment_autism_adult_health_employment",
            "proto_neurodevelopment_autism_child_early_intervention_school",
            "proto_neurodevelopment_autism_diagnosis_postdiagnostic"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_autism_sensory_profile_environment_adjustment",
          protocols: [
            "proto_neurodevelopment_autism_adult_health_employment",
            "proto_neurodevelopment_autism_child_early_intervention_school",
            "proto_neurodevelopment_autism_diagnosis_postdiagnostic",
            "proto_neurodevelopment_autism_idd_behavior_safety_medication"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_positive_behavior_support_plan_idd_autism",
          protocols: [
            "proto_neurodevelopment_autism_idd_behavior_safety_medication",
            "proto_neurodevelopment_learning_disability_health_access"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledIncludes(stack.schedule.daily.care_planning, [
      "iv_autism_healthcare_reasonable_adjustments_passport",
      "iv_autism_challenging_behavior_functional_assessment",
      "iv_autism_crisis_safety_plan_behavior_escalation"
    ]);
    expectScheduledIncludes(stack.schedule.weekly.scheduled_session, [
      "iv_speech_language_therapy_autism_communication",
      "iv_autism_parent_mediated_social_communication_intervention"
    ]);
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("applies musculoskeletal pain, fall prevention, and migraine batch with review and dedupe", async () => {
    const protocols = protocolsByPrefix(library, "proto_msk_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 70,
        flags: flagSet("clinician_managed low_back_pain acute_low_back_pain chronic_low_back_pain recurrent_low_back_pain directional_preference_back_pain radiating_back_pain manual_therapy_ok nsaid_ok pain_medication_candidate chronic_pain pain_catastrophizing pain_cbt_ok mind_body_preferred inflammatory_pain_flare central_sensitization osteoarthritis knee_oa hip_oa hand_oa thumb_base_oa low_impact_preferred overweight knee_instability walking_pain topical_nsaid_ok systemic_nsaid_candidate knee_oa_flare fall_risk prior_fall home_safety_focus polypharmacy sedating_medications balance_focus gait_instability migraine recurrent_headache triptan_candidate gepant_candidate migraine_nausea migraine_prevention_candidate beta_blocker_ok topiramate_ok cgrp_prevention_candidate gepant_prevention_candidate chronic_migraine")
      }
    );
    expectStackUnits(stack, [
      "iv_back_pain_red_flag_triage",
      "iv_stay_active_back_pain",
      "iv_superficial_heat_back_pain",
      "iv_core_stabilization_lbp",
      "iv_directional_preference_lbp",
      "iv_spinal_manipulation_lbp",
      "iv_pain_cbt_skills",
      "iv_mindfulness_based_pain_reduction",
      "iv_aquatic_exercise_oa",
      "iv_oa_weight_loss_plan",
      "iv_topical_nsaid_oa",
      "iv_oral_nsaid_short_course",
      "iv_duloxetine_chronic_msk_pain",
      "iv_intraarticular_glucocorticoid_oa",
      "iv_fall_risk_steadi_screen",
      "iv_otago_fall_prevention_exercise",
      "iv_headache_diary",
      "iv_migraine_medication_overuse_guardrail",
      "iv_triptan_acute_migraine",
      "iv_gepant_acute_migraine",
      "iv_cgrp_monoclonal_migraine_prevention",
      "iv_onabotulinumtoxin_chronic_migraine"
    ]);
    expect(unitCount(stack, "iv_pain_interference_scale")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_pain_interference_scale",
          protocols: [
            "proto_msk_chronic_pain_self_management",
            "proto_msk_low_back_pain_rehab",
            "proto_msk_osteoarthritis_function"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_oral_nsaid_short_course",
          protocols: [
            "proto_msk_chronic_pain_self_management",
            "proto_msk_low_back_pain_rehab",
            "proto_msk_osteoarthritis_function"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("applies gastrointestinal and liver batch with screening, clinician review, and dedupe", async () => {
    const protocols = protocolsByPrefix(library, "proto_gi_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 48,
        flags: flagSet("clinician_managed gerd reflux_symptoms nocturnal_reflux postprandial_reflux trigger_food_focus overweight ppi_candidate h2_blocker_candidate ibs ibs_c ibs_d ibs_pain low_fodmap_ok fiber_focus stress_focus rifaximin_candidate secretagogue_candidate constipation chronic_idiopathic_constipation peg_candidate constipation_rescue_needed defecatory_disorder chronic_diarrhea celiac_risk malabsorption confirmed_celiac lactose_intolerance_suspected lactose_intolerance masld fatty_liver metabolic_syndrome type2_diabetes liver_disease ibd ulcerative_colitis mild_moderate_uc moderate_severe_uc recurrent_cdiff fmt_candidate acute_diarrhea", { hbv_screened: false, hcv_screened: false })
      }
    );
    const unitIds = stackUnitIds(stack);

    expectStackUnits(stack, [
      "iv_gi_alarm_symptom_triage",
      "iv_reflux_symptom_tracking",
      "iv_gerd_weight_loss_if_overweight",
      "iv_gerd_meal_timing_head_elevation",
      "iv_proton_pump_inhibitor_gerd",
      "iv_low_fodmap_trial_ibs",
      "iv_psyllium_soluble_fiber_ibs_constipation",
      "iv_gut_directed_cbt_hypnotherapy",
      "iv_rifaximin_ibs_d",
      "iv_linaclotide_ibs_c_cic",
      "iv_polyethylene_glycol_constipation",
      "iv_pelvic_floor_biofeedback_constipation",
      "iv_celiac_serology_screen",
      "iv_gluten_free_diet_celiac",
      "iv_lactase_enzyme",
      "iv_liver_fibrosis_fib4_screen",
      "iv_hepatitis_b_screening",
      "iv_hepatitis_c_screening",
      "iv_masld_weight_loss_calorie_deficit",
      "iv_masld_exercise_plan",
      "iv_alcohol_abstinence_liver_disease",
      "iv_fecal_calprotectin_ibd_monitoring",
      "iv_mesalamine_uc",
      "iv_advanced_ibd_biologic_or_small_molecule",
      "iv_fecal_microbiota_recurrent_cdiff",
      "iv_oral_rehydration_solution_diarrhea"
    ]);
    expect(unitIds).not.toContain("iv_enteric_peppermint_oil_ibs");
    expect(unitCount(stack, "iv_gi_alarm_symptom_triage")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_gi_alarm_symptom_triage",
          protocols: [
            "proto_gi_acute_diarrhea_rehydration",
            "proto_gi_celiac_malabsorption",
            "proto_gi_constipation_bowel_regularity",
            "proto_gi_gerd_reflux_management",
            "proto_gi_ibd_specialty_monitoring",
            "proto_gi_ibs_symptom_management"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_psyllium_soluble_fiber_ibs_constipation",
          protocols: ["proto_gi_constipation_bowel_regularity", "proto_gi_ibs_symptom_management"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_linaclotide_ibs_c_cic",
          protocols: ["proto_gi_constipation_bowel_regularity", "proto_gi_ibs_symptom_management"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("applies renal, urologic, sexual health, and menopause batch with clinical review and dedupe", async () => {
    const protocols = library
      .allProtocols()
      .filter(
        (protocol) =>
          protocol.id.startsWith("proto_renal_") ||
          protocol.id.startsWith("proto_urologic_") ||
          protocol.id.startsWith("proto_sexual_health_") ||
          protocol.id.startsWith("proto_reproductive_")
      );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 59,
        sex: "male",
        flags: flagSet("clinician_managed ckd albuminuria ckd_albuminuria hypertension_diagnosis type2_diabetes sglt2_candidate finerenone_candidate kidney_stone_history recurrent_kidney_stones calcium_stone calcium_oxalate_stone recurrent_calcium_stones hyperoxaluria hypocitraturia hypercalciuria hyperuricosuria uric_acid_stone recurrent_uti uti_symptoms cranberry_ok postmenopausal gsm vaginal_estrogen_candidate methenamine_candidate antibiotic_prophylaxis_candidate oab urinary_incontinence urgency_incontinence sui beta3_candidate antimuscarinic_candidate ptns_candidate sui_surgery_candidate bph luts nocturia storage_luts alpha_blocker_candidate enlarged_prostate tadalafil_candidate refractory_luts ed erectile_dysfunction pde5_candidate daily_tadalafil_candidate low_testosterone_symptoms confirmed_testosterone_deficiency trt_candidate menopause vasomotor_symptoms vaginal_dryness dyspareunia gsm_prescription_candidate mht_candidate nonhormonal_vms_candidate")
      }
    );
    expectStackUnits(stack, [
      "iv_ckd_egfr_uacr_monitoring",
      "iv_ckd_nephrotoxin_review",
      "iv_ckd_sodium_target",
      "iv_ras_inhibitor_albuminuric_ckd",
      "iv_sglt2_inhibitor_cardiorenal",
      "iv_finerenone_ckd_t2d",
      "iv_kidney_stone_analysis",
      "iv_kidney_stone_fluid_target",
      "iv_kidney_stone_potassium_citrate",
      "iv_thiazide_stone_prevention",
      "iv_allopurinol_hyperuricosuric_stones",
      "iv_urine_culture_recurrent_uti",
      "iv_cranberry_extract",
      "iv_low_dose_vaginal_estrogen_gsm_uti",
      "iv_methenamine_hippurate_uti_prophylaxis",
      "iv_targeted_antibiotic_uti_prophylaxis",
      "iv_bladder_diary",
      "iv_bladder_training_timed_voiding",
      "iv_pelvic_floor_muscle_training",
      "iv_oab_beta3_agonist",
      "iv_oab_antimuscarinic",
      "iv_ptns_oab",
      "iv_midurethral_sling_sui",
      "iv_ipss_luts_tracking",
      "iv_bph_alpha_blocker",
      "iv_bph_5alpha_reductase_inhibitor",
      "iv_tadalafil_luts_ed",
      "iv_bph_procedure_evaluation",
      "iv_ed_cardiometabolic_risk_screen",
      "iv_pde5_inhibitor_ed",
      "iv_testosterone_deficiency_confirmatory_testing",
      "iv_testosterone_therapy_male_hypogonadism",
      "iv_menopause_symptom_tracking",
      "iv_systemic_menopausal_hormone_therapy",
      "iv_nonhormonal_vasomotor_pharmacotherapy",
      "iv_vaginal_moisturizer_lubricant_gsm",
      "iv_ospemifene_or_vaginal_dhea_gsm"
    ]);
    expect(unitCount(stack, "iv_low_dose_vaginal_estrogen_gsm_uti")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_low_dose_vaginal_estrogen_gsm_uti",
          protocols: ["proto_reproductive_menopause_gsm_vms", "proto_urologic_recurrent_uti_prevention"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_bladder_diary",
          protocols: ["proto_urologic_bph_luts", "proto_urologic_oab_incontinence"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_tadalafil_luts_ed",
          protocols: ["proto_sexual_health_ed_testosterone", "proto_urologic_bph_luts"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("applies respiratory and allergy batch with airway safety, advanced therapy, and dedupe", async () => {
    const protocols = library
      .allProtocols()
      .filter((protocol) => protocol.id.startsWith("proto_respiratory_") || protocol.id.startsWith("proto_allergy_"));
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 61,
        flags: flagSet("clinician_managed asthma wheeze chronic_cough uncontrolled_asthma exacerbation_history allergic_asthma trigger_exposure inhaler_use ics_candidate mart_candidate rescue_inhaler_needed lama_candidate severe_asthma asthma_biologic_candidate asthma_exacerbation copd chronic_dyspnea smoking_history frequent_exacerbations tobacco_user laba_lama_candidate triple_therapy_candidate dyspnea_burden post_exacerbation pulmonary_rehab_candidate severe_resting_hypoxemia chronic_hypercapnia niv_candidate chronic_bronchitis roflumilast_candidate azithromycin_candidate copd_exacerbation allergic_rhinitis immunotherapy_candidate nasal_congestion antihistamine_candidate urticaria anaphylaxis_risk food_allergy venom_allergy severe_allergy food_allergy_uncertain food_reintroduction_assessment venom_immunotherapy_candidate sinusitis chronic_rhinosinusitis nasal_polyps crs_biologic_candidate acute_bacterial_sinusitis unstable_airway_symptoms")
      }
    );
    const unitIds = stackUnitIds(stack);

    expectStackUnits(stack, [
      "iv_spirometry_airflow_assessment",
      "iv_peak_flow_monitoring",
      "iv_asthma_action_plan",
      "iv_inhaler_technique_spacer_training",
      "iv_asthma_trigger_control_plan",
      "iv_low_dose_ics_controller_asthma",
      "iv_ics_formoterol_mart_asthma",
      "iv_saba_rescue_inhaler",
      "iv_tiotropium_lama_asthma_addon",
      "iv_asthma_biologic_phenotype_therapy",
      "iv_oral_corticosteroid_exacerbation_burst",
      "iv_copd_cat_mmrc_assessment",
      "iv_copd_exacerbation_action_plan",
      "iv_tobacco_cessation",
      "iv_laba_lama_copd",
      "iv_triple_therapy_copd_ics_laba_lama",
      "iv_pulmonary_rehabilitation_copd",
      "iv_long_term_oxygen_therapy",
      "iv_chronic_noninvasive_ventilation_copd",
      "iv_roflumilast_copd",
      "iv_chronic_azithromycin_copd_exacerbation_prevention",
      "iv_allergy_trigger_testing",
      "iv_intranasal_corticosteroid_rhinitis",
      "iv_intranasal_antihistamine_rhinitis",
      "iv_second_generation_oral_antihistamine",
      "iv_anaphylaxis_emergency_action_plan",
      "iv_epinephrine_autoinjector_anaphylaxis",
      "iv_food_allergen_avoidance_label_review",
      "iv_oral_food_challenge",
      "iv_venom_immunotherapy",
      "iv_medical_alert_allergy_identification",
      "iv_nasal_saline_irrigation",
      "iv_chronic_rhinosinusitis_intranasal_steroid_irrigation",
      "iv_crs_nasal_polyps_biologic",
      "iv_acute_bacterial_sinusitis_antibiotic"
    ]);
    expect(unitIds).not.toContain("iv_allergen_immunotherapy_scit_slit");
    expect(unitCount(stack, "iv_spirometry_airflow_assessment")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_spirometry_airflow_assessment",
          protocols: [
            "proto_respiratory_airway_safety_monitoring",
            "proto_respiratory_asthma_control",
            "proto_respiratory_copd_management"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_inhaler_technique_spacer_training",
          protocols: [
            "proto_respiratory_airway_safety_monitoring",
            "proto_respiratory_asthma_control",
            "proto_respiratory_copd_management"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_saba_rescue_inhaler",
          protocols: ["proto_respiratory_asthma_control", "proto_respiratory_copd_management"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_intranasal_corticosteroid_rhinitis",
          protocols: ["proto_allergy_rhinitis_control", "proto_respiratory_sinusitis_crs"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes dermatology and wound-care protocols with shared barrier and triage collisions", async () => {
    const dermatologyProtocols = protocolsByPrefix(library, "proto_derm_");
    const stack = applyTest(
      dermatologyProtocols,
      {
        ...baseProfile,
        sex: "female",
        pregnant: false,
        flags: flagSet("clinician_managed acne inflammatory_acne moderate_acne severe_acne acne_scarring_risk topical_acne_candidate topical_antibiotic_candidate oral_antibiotic_candidate isotretinoin_candidate atopic_dermatitis eczema dry_skin skin_barrier_focus eczema_flare moderate_severe_eczema topical_steroid_candidate calcineurin_candidate eczema_biologic_candidate psoriasis moderate_severe_psoriasis psoriasis_topical_candidate phototherapy_candidate psoriasis_biologic_candidate rosacea sensitive_skin papulopustular_rosacea rosacea_oral_candidate rosacea_erythema laser_candidate actinic_keratosis skin_cancer_high_risk outdoor_time changing_skin_lesion ak_cryotherapy_candidate ak_field_therapy_candidate ak_photodynamic_candidate tinea athletes_foot onychomycosis oral_antifungal_candidate skin_abscess cellulitis hsv recurrent_hsv diabetes diabetic_foot_risk neuropathy diabetic_foot_ulcer wound_care_needed nonhealing_wound")
      }
    );
    expectProtocolIdsInclude(dermatologyProtocols, [
      "proto_derm_acne_management",
      "proto_derm_atopic_dermatitis_barrier_inflammation",
      "proto_derm_psoriasis_treat_to_target",
      "proto_derm_rosacea_control",
      "proto_derm_actinic_keratosis_field_cancerization",
      "proto_derm_skin_infection_hsv_fungal",
      "proto_derm_wound_diabetic_foot_care"
    ]);
    expectStackUnits(stack, [
      "iv_acne_topical_retinoid",
      "iv_acne_isotretinoin",
      "iv_eczema_daily_emollient",
      "iv_eczema_dupilumab_tralokinumab",
      "iv_psoriasis_biologic_systemic",
      "iv_rosacea_laser_light_therapy",
      "iv_actinic_keratosis_field_therapy_5fu_imiquimod",
      "iv_skin_abscess_incision_drainage",
      "iv_cellulitis_antibiotic_therapy",
      "iv_hsv_antiviral_episodic_suppressive",
      "iv_diabetic_foot_ulcer_offloading",
      "iv_wound_debridement_moist_dressing"
    ]);
    expect(unitCount(stack, "iv_moisturizer_barrier")).toBe(1);
    expect(unitCount(stack, "iv_derm_lesion_change_triage")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_moisturizer_barrier",
          protocols: ["proto_derm_atopic_dermatitis_barrier_inflammation", "proto_derm_rosacea_control"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_derm_lesion_change_triage",
          protocols: ["proto_derm_actinic_keratosis_field_cancerization", "proto_derm_wound_diabetic_foot_care"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes eye and vision protocols with retina, glaucoma, dry-eye, and cataract pathways", async () => {
    const eyeProtocols = protocolsByPrefix(library, "proto_eye_");
    const stack = applyTest(
      eyeProtocols,
      {
        ...baseProfile,
        age: 68,
        flags: flagSet("clinician_managed vision_change eye_disease_risk outdoor_time cataract_risk amd_risk eye_hazard_work power_tools sports_eye_risk low_leafy_green_intake eye_nutrition_focus diabetes type2_diabetes diabetic_retinopathy diabetic_macular_edema vision_threatening_diabetic_retinopathy proliferative_diabetic_retinopathy retinal_laser_candidate diabetic_vision_impairment glaucoma ocular_hypertension glaucoma_risk open_angle_glaucoma glaucoma_drop_candidate additional_iop_lowering_needed slt_candidate glaucoma_drop_use amd intermediate_amd late_amd_one_eye wet_amd central_vision_change advanced_amd_vision_impairment dry_eye ocular_surface_symptoms contact_lens_user screen_heavy digital_eye_strain low_humidity_environment moderate_severe_dry_eye dry_eye_rx_candidate punctal_plug_candidate bacterial_conjunctivitis keratitis_concern cataract glare_disability cataract_surgery_candidate flashes_floaters curtain_vision_loss retinal_tear_risk retinal_tear retinal_detachment low_vision irreversible_vision_impairment")
      }
    );
    expectProtocolIdsInclude(eyeProtocols, [
      "proto_eye_aging_vision_prevention",
      "proto_eye_diabetic_retina_protection",
      "proto_eye_glaucoma_pressure_control",
      "proto_eye_amd_management",
      "proto_eye_dry_eye_contact_lens_safety",
      "proto_eye_cataract_retina_urgent_care"
    ]);
    expectStackUnits(stack, [
      "iv_comprehensive_eye_exam",
      "iv_diabetic_retinal_exam",
      "iv_eye_iop_optic_nerve_oct_visual_field_monitoring",
      "iv_glaucoma_prostaglandin_analog_drop",
      "iv_selective_laser_trabeculoplasty",
      "iv_areds2_supplement",
      "iv_intravitreal_antivegf_retinal_disease",
      "iv_artificial_tears_lubricating_drops",
      "iv_dry_eye_cyclosporine_lifitegrast",
      "iv_cataract_surgery_iol",
      "iv_retinal_detachment_symptom_triage",
      "iv_retinal_detachment_repair",
      "iv_low_vision_rehabilitation"
    ]);
    expect(unitCount(stack, "iv_comprehensive_eye_exam")).toBe(1);
    expect(unitCount(stack, "iv_retinal_oct_monitoring")).toBe(1);
    expect(unitCount(stack, "iv_low_vision_rehabilitation")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_retinal_oct_monitoring",
          protocols: ["proto_eye_amd_management", "proto_eye_diabetic_retina_protection"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_low_vision_rehabilitation",
          protocols: [
            "proto_eye_amd_management",
            "proto_eye_cataract_retina_urgent_care",
            "proto_eye_diabetic_retina_protection"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes neurology protocols with cognitive, stroke, Parkinson, seizure, and concussion pathways", async () => {
    const neuroProtocols = protocolsByPrefix(library, "proto_neuro_");
    const stack = applyTest(
      neuroProtocols,
      {
        ...baseProfile,
        age: 72,
        flags: flagSet("clinician_managed cognitive_focus cognitive_concern memory_concern dementia_risk mci alzheimers_dementia mild_moderate_alzheimers moderate_severe_alzheimers early_alzheimers amyloid_confirmed anti_amyloid_candidate polypharmacy social_isolation hearing_concern vision_change stroke_risk stroke_history stroke_warning_symptoms tia_symptoms tia ischemic_stroke non_cardioembolic_stroke minor_ischemic_stroke high_risk_tia atrial_fibrillation high_intensity_statin_candidate symptomatic_carotid_stenosis post_stroke_deficit parkinson_disease gait_instability fall_risk balance_focus dysphagia hypophonia levodopa_candidate dopaminergic_adjunct_candidate advanced_parkinson dbs_candidate epilepsy seizure_history seizure_clusters prolonged_seizure_risk head_injury concussion mild_tbi worsening_concussion_symptoms")
      }
    );
    expectProtocolIdsInclude(neuroProtocols, [
      "proto_neuro_cognitive_decline_risk_reduction",
      "proto_neuro_mci_dementia_evaluation_treatment",
      "proto_neuro_stroke_tia_secondary_prevention",
      "proto_neuro_parkinson_function_management",
      "proto_neuro_seizure_concussion_safety"
    ]);
    expectStackUnits(stack, [
      "iv_cognitive_screen_moca_mmse",
      "iv_mci_reversible_cause_workup",
      "iv_anti_amyloid_mab_early_alzheimer",
      "iv_antiplatelet_secondary_stroke_prevention",
      "iv_oral_anticoagulation_af_stroke_prevention",
      "iv_post_stroke_rehabilitation_pt_ot_speech",
      "iv_parkinson_exercise_program",
      "iv_levodopa_carbidopa_parkinson",
      "iv_deep_brain_stimulation_parkinson",
      "iv_rescue_benzodiazepine_seizure_cluster",
      "iv_concussion_gradual_return_activity"
    ]);
    expect(unitCount(stack, "iv_cognitive_screen_moca_mmse")).toBe(1);
    expect(unitCount(stack, "iv_structured_cognitive_training")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_cognitive_screen_moca_mmse",
          protocols: ["proto_neuro_cognitive_decline_risk_reduction", "proto_neuro_mci_dementia_evaluation_treatment"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_structured_cognitive_training",
          protocols: ["proto_neuro_cognitive_decline_risk_reduction", "proto_neuro_mci_dementia_evaluation_treatment"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes oncology prevention and survivorship protocols with screening, rehab, toxicity, and genetics pathways", async () => {
    const oncologyProtocols = protocolsByPrefix(library, "proto_oncology_");
    const stack = applyTest(
      oncologyProtocols,
      {
        ...baseProfile,
        age: 52,
        sex: "female",
        flags: flagSet("clinician_managed cancer_prevention_focus oncology_prevention_focus tobacco_user hpv_vaccine_due hbv_vaccine_due overweight processed_meat_intake high_red_meat_intake alcohol_user low_fiber_intake outdoor_time skin_cancer_high_risk indoor_tanning cancer_screening_navigation colorectal_cancer_risk colonoscopy_due breast_cancer_risk cervical_screening_due hpv_screening_due lung_screening_eligible family_history_breast_ovarian_pancreatic_prostate_cancer brca_ancestry_risk hereditary_cancer_risk_tool_positive brca_risk lynch_syndrome_risk cancer_survivor active_cancer_treatment post_cancer_treatment deconditioning sarcopenia_risk unintentional_weight_loss poor_appetite malnutrition_risk cancer_fatigue cancer_distress cancer_rehab_need functional_impairment lymph_node_surgery radiation_lymphedema_risk lymphedema compression_garment_candidate neurotoxic_chemotherapy cipn_symptoms painful_cipn duloxetine_candidate emetogenic_chemotherapy myelosuppressive_chemotherapy mucositis_risk_chemo anthracycline_exposure trastuzumab_exposure gonadotoxic_cancer_treatment_planned fertility_preservation_interest young_adult_cancer fertility_distress")
      }
    );
    expectProtocolIdsInclude(oncologyProtocols, [
      "proto_oncology_cancer_prevention_foundation",
      "proto_oncology_screening_navigation",
      "proto_oncology_hereditary_risk_genetics",
      "proto_oncology_survivorship_lifestyle_rehab",
      "proto_oncology_treatment_toxicity_support",
      "proto_oncology_reproductive_fertility_preservation"
    ]);
    expectStackUnits(stack, [
      "iv_oncology_risk_factor_inventory",
      "iv_hpv_vaccination_cancer_prevention",
      "iv_hepatitis_b_vaccination_liver_cancer_prevention",
      "iv_processed_meat_avoidance_cancer_prevention",
      "iv_colorectal_fit_screening",
      "iv_mammography_screening",
      "iv_genetic_counseling_testing_hereditary_cancer",
      "iv_cancer_survivorship_care_plan",
      "iv_cancer_related_fatigue_exercise_program",
      "iv_oncology_distress_thermometer_screening",
      "iv_cancer_rehabilitation_referral",
      "iv_complete_decongestive_therapy_lymphedema",
      "iv_duloxetine_painful_cipn",
      "iv_antiemetic_prophylaxis_cinv",
      "iv_neutropenic_fever_emergency_plan",
      "iv_fertility_preservation_referral_oncology"
    ]);
    expect(unitCount(stack, "iv_oncology_risk_factor_inventory")).toBe(1);
    expect(unitCount(stack, "iv_cancer_survivorship_care_plan")).toBe(1);
    expect(unitCount(stack, "iv_cancer_nutrition_screening_dietitian_referral")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_oncology_risk_factor_inventory",
          protocols: ["proto_oncology_cancer_prevention_foundation", "proto_oncology_screening_navigation"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_cancer_survivorship_care_plan",
          protocols: [
            "proto_oncology_hereditary_risk_genetics",
            "proto_oncology_reproductive_fertility_preservation",
            "proto_oncology_survivorship_lifestyle_rehab"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_oncology_distress_thermometer_screening",
          protocols: [
            "proto_oncology_reproductive_fertility_preservation",
            "proto_oncology_survivorship_lifestyle_rehab"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes infectious disease, STI prevention, adult immunization, travel, TB, and respiratory outbreak pathways", async () => {
    const infectiousProtocols = protocolsByPrefix(library, "proto_infectious_");
    const stack = applyTest(
      infectiousProtocols,
      {
        ...baseProfile,
        age: 52,
        sex: "female",
        pregnant: true,
        flags: flagSet("clinician_managed sexually_active sti_screening_due new_partner multiple_partners msm prep_candidate prep_requested hiv_prevention_focus hiv_exposure_within_72h doxy_pep_candidate recent_bacterial_sti sti_diagnosed injection_drug_use shares_injection_equipment mpox_vaccine_eligible hepa_vaccine_due hbv_vaccine_due hbv_nonimmune tdap_due tetanus_booster_due mmr_nonimmune varicella_nonimmune zoster_vaccine_due pneumococcal_risk rsv_high_risk meningococcal_vaccine_due asplenia polio_vaccine_due international_travel travel_medicine_focus travel_vaccine_review polio_travel_risk typhoid_travel_risk yellow_fever_travel_risk yellow_fever_certificate_required japanese_encephalitis_travel_risk rabies_travel_risk malaria_travel_risk mosquito_tick_exposure arbovirus_travel_risk outdoor_sleeping_travel travelers_diarrhea_risk travelers_diarrhea_standby_candidate tb_exposure birth_or_residence_high_tb_country latent_tb_positive infection_prevention_focus respiratory_outbreak_risk immunocompromised crowded_indoor_exposure")
      }
    );
    expectProtocolIdsInclude(infectiousProtocols, [
      "proto_infectious_hiv_sti_prevention",
      "proto_infectious_adult_immunization_expanded",
      "proto_infectious_travel_medicine",
      "proto_infectious_tb_screening_treatment",
      "proto_infectious_respiratory_outbreak_prevention"
    ]);
    expectStackUnits(stack, [
      "iv_hiv_screening_universal",
      "iv_sti_panel_anatomic_site_screening",
      "iv_hiv_prep_antiretroviral",
      "iv_hiv_postexposure_prophylaxis_npep",
      "iv_doxycycline_sti_postexposure_prophylaxis",
      "iv_sterile_syringe_services_linkage",
      "iv_tdap_td_adult_booster",
      "iv_mmr_adult_vaccination",
      "iv_varicella_vaccination_adult",
      "iv_hepatitis_a_vaccination",
      "iv_mpox_jynneos_vaccination",
      "iv_pretravel_consult_itinerary_review",
      "iv_typhoid_vaccination_travel",
      "iv_yellow_fever_vaccination_travel",
      "iv_japanese_encephalitis_vaccination_travel",
      "iv_rabies_preexposure_vaccination_travel",
      "iv_malaria_chemoprophylaxis_travel",
      "iv_travelers_diarrhea_standby_antibiotic",
      "iv_latent_tb_infection_treatment",
      "iv_respiratory_masking_ventilation_high_risk"
    ]);
    expect(unitCount(stack, "iv_hiv_screening_universal")).toBe(1);
    expect(unitCount(stack, "iv_hepatitis_a_vaccination")).toBe(1);
    expect(unitCount(stack, "iv_tdap_td_adult_booster")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_hiv_screening_universal",
          protocols: ["proto_infectious_hiv_sti_prevention", "proto_infectious_tb_screening_treatment"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_hepatitis_a_vaccination",
          protocols: [
            "proto_infectious_adult_immunization_expanded",
            "proto_infectious_hiv_sti_prevention",
            "proto_infectious_travel_medicine"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_tdap_td_adult_booster",
          protocols: ["proto_infectious_adult_immunization_expanded", "proto_infectious_travel_medicine"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "skin");
    expect(stack.review_required).toBe(true);
  });

  it("composes preconception, prenatal, pregnancy safety, vaccine, and postpartum pathways", async () => {
    const perinatalProtocols = protocolsByPrefix(library, "proto_perinatal_");
    const stack = applyTest(
      perinatalProtocols,
      {
        ...baseProfile,
        age: 34,
        sex: "female",
        pregnant: true,
        medications: ["lamotrigine"],
        flags: flagSet("clinician_managed preconception_focus interpregnancy_care vaccine_review_due prenatal_care pregnancy_hypertension_risk preeclampsia_risk preeclampsia_high_risk gdm_screen_due late_pregnancy severe_headache pregnancy_nutrition_focus low_choline_intake pregnancy_food_safety_focus urinary_incontinence pelvic_floor_focus pregnancy_oral_health_focus nausea_vomiting_pregnancy rsv_season postpartum hypertensive_disorder_pregnancy postpartum_mood_symptoms breastfeeding birth_spacing_focus", { trying_to_conceive: false })
      }
    );
    expectProtocolIdsInclude(perinatalProtocols, [
      "proto_perinatal_preconception_foundation",
      "proto_perinatal_prenatal_monitoring_screening",
      "proto_perinatal_pregnancy_nutrition_activity_safety",
      "proto_perinatal_medication_vaccine_risk_reduction",
      "proto_perinatal_postpartum_recovery_lactation"
    ]);
    expectStackUnits(stack, [
      "iv_folic_acid_preconception_pregnancy",
      "iv_prenatal_multivitamin",
      "iv_pregnancy_choline_intake",
      "iv_low_mercury_fish_pregnancy",
      "iv_pregnancy_listeria_food_safety",
      "iv_prenatal_care_visit_schedule",
      "iv_gestational_diabetes_screening",
      "iv_rh_d_antibody_screening",
      "iv_prenatal_hiv_hbv_hcv_syphilis_screening",
      "iv_low_dose_aspirin_preeclampsia_prevention",
      "iv_pyridoxine_doxylamine_nvp",
      "iv_maternal_rsv_vaccine",
      "iv_tdap_td_adult_booster",
      "iv_influenza_vaccination",
      "iv_covid_vaccination",
      "iv_postpartum_contact_comprehensive_visit",
      "iv_perinatal_depression_anxiety_screening",
      "iv_breastfeeding_lactation_support",
      "iv_postpartum_contraception_birth_spacing"
    ]);
    expect(unitCount(stack, "iv_prenatal_multivitamin")).toBe(1);
    expect(unitCount(stack, "iv_pregnancy_alcohol_abstinence")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_prenatal_multivitamin",
          protocols: ["proto_perinatal_preconception_foundation", "proto_perinatal_pregnancy_nutrition_activity_safety"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_pregnancy_alcohol_abstinence",
          protocols: ["proto_perinatal_preconception_foundation", "proto_perinatal_pregnancy_nutrition_activity_safety"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_perinatal_depression_anxiety_screening",
          protocols: ["proto_perinatal_postpartum_recovery_lactation", "proto_perinatal_prenatal_monitoring_screening"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
    expect(stack.evidence_summary.A).toBeGreaterThan(0);
  });

  it("composes endocrine thyroid, adrenal, PCOS, and infertility pathways", async () => {
    const endocrineProtocols = library
      .allProtocols()
      .filter((protocol) => protocol.id.startsWith("proto_endocrine_") || protocol.id.startsWith("proto_reproductive_pcos_") || protocol.id === "proto_reproductive_infertility_evaluation_art");
    const stack = applyTest(
      endocrineProtocols,
      {
        ...baseProfile,
        age: 39,
        sex: "female",
        pregnant: false,
        flags: flagSet("clinician_managed thyroid_symptoms hypothyroid hashimoto abnormal_tsh autoimmune_thyroid_suspected overt_hypothyroid levothyroxine_candidate hyperthyroid_symptoms graves_disease graves_suspected low_tsh hyperthyroid_tachycardia antithyroid_drug_candidate radioiodine_candidate thyroid_surgery_candidate large_goiter compressing_goiter graves_eye_symptoms thyroid_nodule suspicious_thyroid_ultrasound thyroid_nodule_fna_indicated thyroid_cancer_suspected adrenal_insufficiency_symptoms primary_adrenal_insufficiency adrenal_crisis_risk chronic_glucocorticoid_use hydrocortisone_replacement_candidate mineralocorticoid_replacement_candidate pcos pcos_suspected androgen_excess irregular_menses insulin_resistance metformin_candidate pcos_cycle_control_needed pcos_hyperandrogenism infrequent_menses hirsutism infertility anovulation anovulatory_infertility pregnancy_excluded letrozole_candidate male_factor_risk tubal_factor_risk uterine_factor_risk art_candidate ivf_interest", { trying_to_conceive: false })
      }
    );
    expectProtocolIdsInclude(endocrineProtocols, [
      "proto_endocrine_hypothyroid_hashimoto_management",
      "proto_endocrine_hyperthyroid_graves_management",
      "proto_endocrine_thyroid_nodule_cancer_risk",
      "proto_endocrine_adrenal_insufficiency_safety",
      "proto_reproductive_pcos_metabolic_and_hyperandrogenism",
      "proto_reproductive_pcos_infertility_ovulation",
      "proto_reproductive_infertility_evaluation_art"
    ]);
    expectStackUnits(stack, [
      "iv_thyroid_stimulating_hormone",
      "iv_free_t4_thyroid_panel",
      "iv_thyroid_peroxidase_antibody_testing",
      "iv_tsh_receptor_antibody_testing",
      "iv_thyroid_ultrasound_risk_stratification",
      "iv_thyroid_fine_needle_aspiration",
      "iv_levothyroxine_replacement",
      "iv_antithyroid_drug_therapy",
      "iv_beta_blocker_hyperthyroid_symptom_control",
      "iv_radioactive_iodine_hyperthyroidism",
      "iv_adrenal_insufficiency_diagnostic_testing",
      "iv_hydrocortisone_glucocorticoid_replacement",
      "iv_emergency_hydrocortisone_injection",
      "iv_pcos_diagnostic_exclusion_workup",
      "iv_pcos_lifestyle_weight_management",
      "iv_combined_hormonal_contraception_pcos",
      "iv_letrozole_ovulation_induction_pcos",
      "iv_semen_analysis_male_factor_evaluation",
      "iv_tubal_patency_uterine_cavity_evaluation",
      "iv_assisted_reproductive_technology_referral"
    ]);
    expect(unitCount(stack, "iv_thyroid_stimulating_hormone")).toBe(1);
    expect(unitCount(stack, "iv_metformin")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_thyroid_stimulating_hormone",
          protocols: [
            "proto_endocrine_hyperthyroid_graves_management",
            "proto_endocrine_hypothyroid_hashimoto_management",
            "proto_endocrine_thyroid_nodule_cancer_risk"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_pcos_diagnostic_exclusion_workup",
          protocols: [
            "proto_reproductive_pcos_infertility_ovulation",
            "proto_reproductive_pcos_metabolic_and_hyperandrogenism"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_metformin",
          protocols: [
            "proto_reproductive_pcos_infertility_ovulation",
            "proto_reproductive_pcos_metabolic_and_hyperandrogenism"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("composes geriatric frailty, medication safety, falls, nutrition, goals, and delirium pathways", async () => {
    const geriatricProtocols = protocolsByPrefix(library, "proto_geriatric_");
    const stack = applyTest(
      geriatricProtocols,
      {
        ...baseProfile,
        age: 82,
        sex: "female",
        flags: flagSet("frailty_risk multimorbidity functional_decline caregiver_support_needed caregiver_concern sarcopenia_risk weakness prior_fall fall_risk balance_problem home_hazard_risk dizziness syncope foot_pain unsafe_footwear mobility_aid_use gait_instability driving_safety_concern vision_impairment polypharmacy high_risk_medication sedating_medications anticholinergic_burden benzodiazepine_use malnutrition_risk unintentional_weight_loss poor_appetite low_fluid_intake dehydration_risk diuretic_use recurrent_uti serious_illness advance_care_planning_due caregiver_burden high_symptom_burden recurrent_hospitalization dementia alzheimers_dementia advanced_dementia feeding_difficulty aspiration_risk hospitalized acute_illness delirium_risk cognitive_impairment immobile pressure_injury_risk")
      }
    );
    expectProtocolIdsInclude(geriatricProtocols, [
      "proto_geriatric_frailty_function_foundation",
      "proto_geriatric_medication_safety_deprescribing",
      "proto_geriatric_falls_mobility_independence",
      "proto_geriatric_nutrition_hydration_sarcopenia",
      "proto_geriatric_goals_caregiver_palliative",
      "proto_geriatric_delirium_pressure_injury_safety"
    ]);
    expectStackUnits(stack, [
      "iv_comprehensive_geriatric_assessment",
      "iv_frailty_gait_speed_chair_stand_screen",
      "iv_adl_iadl_function_assessment",
      "iv_sarcopenia_case_finding",
      "iv_geriatric_malnutrition_screening",
      "iv_geriatric_oral_nutrition_supplement",
      "iv_geriatric_dehydration_risk_plan",
      "iv_polypharmacy_brown_bag_reconciliation",
      "iv_beers_criteria_pim_review",
      "iv_benzodiazepine_zdrug_deprescribing_review",
      "iv_orthostatic_blood_pressure_assessment",
      "iv_fall_risk_steadi_screen",
      "iv_otago_fall_prevention_exercise",
      "iv_home_hazard_fall_review",
      "iv_mobility_aid_fit_training",
      "iv_driving_safety_mobility_transition_plan",
      "iv_advance_care_planning_general",
      "iv_caregiver_burden_screen_support",
      "iv_palliative_care_needs_screen",
      "iv_careful_hand_feeding_advanced_dementia",
      "iv_delirium_risk_prevention_bundle",
      "iv_pressure_injury_risk_skin_reposition_bundle"
    ]);
    expect(unitCount(stack, "iv_sarcopenia_case_finding")).toBe(1);
    expect(unitCount(stack, "iv_orthostatic_blood_pressure_assessment")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_sarcopenia_case_finding",
          protocols: ["proto_geriatric_frailty_function_foundation", "proto_geriatric_nutrition_hydration_sarcopenia"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_orthostatic_blood_pressure_assessment",
          protocols: ["proto_geriatric_falls_mobility_independence", "proto_geriatric_medication_safety_deprescribing"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_anticholinergic_cognitive_burden_review",
          protocols: ["proto_geriatric_delirium_pressure_injury_safety", "proto_geriatric_medication_safety_deprescribing"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_geriatric_malnutrition_screening",
          protocols: ["proto_geriatric_delirium_pressure_injury_safety", "proto_geriatric_nutrition_hydration_sarcopenia"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(false);
  });

  it("applies oral periodontal, caries, cancer, dental pain, denture, and TMD pathways", async () => {
    const oralProtocols = protocolsByPrefix(library, "proto_oral_");
    const stack = applyTest(
      oralProtocols,
      {
        ...baseProfile,
        age: 72,
        sex: "female",
        flags: flagSet("clinician_managed periodontal_risk gingivitis_risk periodontitis deep_periodontal_pockets prior_scaling_root_planing diabetes poor_glycemic_control caries_risk root_caries_risk high_caries_risk active_caries sdf_candidate restorative_delay dry_mouth xerostomia severe_xerostomia sjogrens tobacco_user alcohol_user hpv_vaccine_due suspicious_oral_lesion persistent_oral_ulcer dental_pain toothache dental_swelling dental_abscess nsaid_ok acetaminophen_ok dental_opioid_prescribed prosthetic_joint dental_procedure_planned denture_user caregiver_support impaired_dexterity cognitive_impairment tmj_pain bruxism tooth_wear contact_sport")
      }
    );
    expectProtocolIdsInclude(oralProtocols, [
      "proto_oral_periodontal_diabetes_foundation",
      "proto_oral_caries_xerostomia_root_caries",
      "proto_oral_cancer_head_neck_prevention",
      "proto_oral_urgent_dental_pain_antibiotic_stewardship",
      "proto_oral_older_adult_denture_caregiver_tmd"
    ]);
    expectStackUnits(stack, [
      "iv_oral_health_risk_assessment",
      "iv_annual_comprehensive_oral_exam",
      "iv_periodontal_charting_bleeding_probing",
      "iv_scaling_root_planing_periodontitis",
      "iv_periodontal_maintenance_recall",
      "iv_diabetes_periodontal_care_coordination",
      "iv_caries_risk_assessment",
      "iv_prescription_high_fluoride_toothpaste",
      "iv_silver_diamine_fluoride_caries_arrest",
      "iv_minimally_invasive_restorative_care",
      "iv_oral_cancer_visual_tactile_exam",
      "iv_suspicious_oral_lesion_biopsy_referral",
      "iv_oral_cancer_risk_counseling",
      "iv_hpv_vaccination_cancer_prevention",
      "iv_dental_pain_definitive_care_triage",
      "iv_dental_infection_systemic_red_flag_triage",
      "iv_dental_antibiotic_stewardship",
      "iv_oral_nsaid_short_course",
      "iv_acetaminophen_pain_limited",
      "iv_dental_opioid_risk_storage_disposal_plan",
      "iv_dental_prophylaxis_antibiotic_review",
      "iv_denture_daily_cleaning_night_removal",
      "iv_caregiver_assisted_oral_hygiene",
      "iv_saliva_substitute_xerostomia",
      "iv_sialagogue_dry_mouth_pharmacotherapy",
      "iv_tmj_conservative_self_management",
      "iv_night_guard_bruxism",
      "iv_sports_mouthguard"
    ]);
    expect(unitCount(stack, "iv_annual_comprehensive_oral_exam")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_annual_comprehensive_oral_exam",
          protocols: [
            "proto_oral_cancer_head_neck_prevention",
            "proto_oral_older_adult_denture_caregiver_tmd",
            "proto_oral_periodontal_diabetes_foundation"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_saliva_substitute_xerostomia",
          protocols: ["proto_oral_caries_xerostomia_root_caries", "proto_oral_older_adult_denture_caregiver_tmd"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("applies sleep disorder, circadian, RLS, and parasomnia pathways", async () => {
    const sleepDisorderProtocols = protocolsByPrefix(library, "proto_sleep_");
    const stack = applyTest(
      sleepDisorderProtocols,
      {
        ...baseProfile,
        age: 57,
        flags: flagSet("clinician_managed insomnia chronic_insomnia sleep_efficiency_low pre_sleep_arousal cbti_access_limited insomnia_medication_candidate sleep_maintenance_insomnia sleep_onset_insomnia short_term_hypnotic_candidate trazodone_for_insomnia diphenhydramine_sleep_aid osa_risk high_osa_risk snoring witnessed_apnea daytime_sleepiness drowsy_driving delayed_sleep_phase evening_light_exposure light_box_ok jet_lag shift_worker night_shift shift_work_disorder excessive_sleepiness restless_legs rls low_ferritin rls_medication_candidate dopamine_agonist_use sedative_burden rem_sleep_behavior_disorder dream_enactment suspected_parasomnia rbd_medication_candidate rbd_clonazepam_candidate osa_diagnosed")
      }
    );
    expectProtocolIdsInclude(sleepDisorderProtocols, [
      "proto_sleep_insomnia_behavioral_pharmacology",
      "proto_sleep_osa_screening_diagnosis",
      "proto_sleep_circadian_shiftwork_jetlag",
      "proto_sleep_restless_legs_plmd",
      "proto_sleep_rem_behavior_parasomnia_safety"
    ]);
    expectStackUnits(stack, [
      "iv_sleep_diary_actigraphy_tracking",
      "iv_insomnia_severity_index_tracking",
      "iv_brief_behavioral_treatment_insomnia",
      "iv_sleep_restriction_compression_cbti",
      "iv_relaxation_training_insomnia",
      "iv_orexin_receptor_antagonist_insomnia",
      "iv_low_dose_doxepin_sleep_maintenance",
      "iv_ramelteon_sleep_onset",
      "iv_nonbenzodiazepine_hypnotic_limited_course",
      "iv_trazodone_antihistamine_insomnia_avoidance_review",
      "iv_stop_bang_osa_screen",
      "iv_home_sleep_apnea_test",
      "iv_light_box_phase_advance",
      "iv_shift_work_anchor_sleep_plan",
      "iv_shift_work_bright_light_strategy",
      "iv_wake_promoting_agent_shift_work_disorder",
      "iv_rls_iron_indices_testing",
      "iv_rls_iron_repletion_plan",
      "iv_alpha2delta_ligand_rls",
      "iv_dopamine_agonist_augmentation_review",
      "iv_rbd_safe_sleep_environment",
      "iv_rbd_immediate_release_melatonin",
      "iv_rbd_clonazepam_cautious_review"
    ]);
    expect(unitCount(stack, "iv_sleep_diary_actigraphy_tracking")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_sleep_diary_actigraphy_tracking",
          protocols: ["proto_sleep_circadian_shiftwork_jetlag", "proto_sleep_insomnia_behavioral_pharmacology"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_drowsy_driving_sleepiness_safety_plan",
          protocols: ["proto_sleep_osa_screening_diagnosis", "proto_sleep_rem_behavior_parasomnia_safety"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "light");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("applies hydration, thermoregulation, and breath/autonomic pathways", async () => {
    const protocols = library
      .allProtocols()
      .filter(
        (protocol) =>
          protocol.id.startsWith("proto_hydration_") ||
          protocol.id.startsWith("proto_temperature_") ||
          protocol.id.startsWith("proto_breath_")
      );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 45,
        flags: flagSet("hydration_focus dehydration_risk heat_exposure exercise_hydration_focus sugary_drinks glucose_focus water_quality_focus endurance_training long_training_session hot_training heavy_sweater heat_wave outdoor_worker heat_medication_risk sauna_user cold_exposure_ok recovery_focus cold_water_exposure winter_weather_exposure stress_focus hypertension_focus hrv_focus biofeedback_ok dyspnea chronic_lung_disease intense_breathwork")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_hydration_daily_foundation",
      "proto_hydration_exercise_sweat_replacement",
      "proto_temperature_heat_safety_acclimatization",
      "proto_temperature_cold_exposure_safety",
      "proto_breath_autonomic_biofeedback"
    ]);
    expectStackUnits(stack, [
      "iv_daily_total_water_intake_plan",
      "iv_water_replaces_sugar_sweetened_beverages",
      "iv_hydration_status_morning_check",
      "iv_filtered_water",
      "iv_sweat_rate_field_test",
      "iv_pre_exercise_hydration_plan",
      "iv_during_exercise_fluid_plan",
      "iv_post_exercise_rehydration_plan",
      "iv_sodium_electrolyte_replacement_heavy_sweat",
      "iv_exercise_hyponatremia_overhydration_guardrail",
      "iv_heat_risk_forecast_check",
      "iv_heat_acclimatization_progression",
      "iv_work_rest_cooling_break_schedule",
      "iv_heat_illness_symptom_action_plan",
      "iv_cooling_center_heat_wave_plan",
      "iv_heat_medication_risk_review",
      "iv_sauna_heat_session_safety",
      "iv_cold_exposure_medical_risk_screen",
      "iv_cold_water_immersion_safety_protocol",
      "iv_hypothermia_recognition_action_plan",
      "iv_resonance_frequency_breathing_hrv",
      "iv_hrv_biofeedback_training",
      "iv_diaphragmatic_breathing_training",
      "iv_pursed_lip_breathing_dyspnea",
      "iv_breathwork_hyperventilation_safety_guardrail"
    ]);
    expect(unitCount(stack, "iv_daily_total_water_intake_plan")).toBe(1);
    expect(unitCount(stack, "iv_during_exercise_fluid_plan")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_daily_total_water_intake_plan",
          protocols: ["proto_hydration_daily_foundation", "proto_temperature_heat_safety_acclimatization"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_during_exercise_fluid_plan",
          protocols: [
            "proto_hydration_exercise_sweat_replacement",
            "proto_temperature_heat_safety_acclimatization"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "hydration");
    expectCategory(stack, "temperature");
    expectCategory(stack, "breath");
    expect(stack.review_required).toBe(false);
  });

  it("applies social connection, purpose, grief, and caregiver pathways", async () => {
    const protocols = library
      .allProtocols()
      .filter(
        (protocol) =>
          protocol.id.startsWith("proto_social_") ||
          protocol.id.startsWith("proto_purpose_") ||
          protocol.id.startsWith("proto_grief_") ||
          protocol.id.startsWith("proto_caregiver_")
      );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 76,
        flags: flagSet("social_health_focus loneliness social_isolation group_activity_ok meal_loneliness passive_social_media digital_barrier remote_family transportation_barrier mobility_limited hearing_concern communication_barrier chronic_condition multimorbidity chronic_condition_isolation unmet_practical_needs home_support_needed purpose_focus retirement_transition volunteering_ok intergenerational_ok faith_community_ok workplace_isolation bereavement grief anniversary_grief grief_group_ok prolonged_grief grief_impairment complicated_grief_therapy_ok resource_navigation_needed exploitation_risk caregiver caregiver_burden caregiver_support_needed respite_needed dementia serious_illness caregiver_peer_support_ok safeguarding_concern dependent_adult")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_social_connection_foundation",
      "proto_social_loneliness_intervention_pathway",
      "proto_purpose_volunteering_life_transition",
      "proto_grief_bereavement_support",
      "proto_caregiver_respite_social_support"
    ]);
    expectStackUnits(stack, [
      "iv_loneliness_social_isolation_screen",
      "iv_social_network_map_contact_cadence",
      "iv_social_connection",
      "iv_in_person_shared_activity",
      "iv_social_prescribing_navigation",
      "iv_befriending_friendly_visit_call",
      "iv_peer_support_group_participation",
      "iv_chronic_condition_self_management_group",
      "iv_volunteering_role",
      "iv_purpose_values_activity_plan",
      "iv_intergenerational_program",
      "iv_skill_learning_group_class",
      "iv_digital_connection_skills_training",
      "iv_social_media_connection_boundary",
      "iv_transportation_access_social_plan",
      "iv_hearing_vision_communication_barrier_review",
      "iv_meal_companion_or_communal_dining",
      "iv_workplace_connection_micropractice",
      "iv_faith_spiritual_community_participation",
      "iv_bereavement_social_support_plan",
      "iv_prolonged_grief_disorder_screen",
      "iv_complicated_grief_therapy_referral",
      "iv_bereavement_ritual_memory_practice",
      "iv_caregiver_burden_screen_support",
      "iv_caregiver_respite_plan",
      "iv_caregiver_skills_training",
      "iv_caregiver_support_advance_care_planning",
      "iv_practical_support_mutual_aid_plan",
      "iv_elder_or_dependent_adult_safeguarding_screen"
    ]);
    expect(unitCount(stack, "iv_loneliness_social_isolation_screen")).toBe(1);
    expect(unitCount(stack, "iv_peer_support_group_participation")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_loneliness_social_isolation_screen",
          protocols: ["proto_social_connection_foundation", "proto_social_loneliness_intervention_pathway"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_peer_support_group_participation",
          protocols: [
            "proto_caregiver_respite_social_support",
            "proto_grief_bereavement_support",
            "proto_social_loneliness_intervention_pathway"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_social_prescribing_navigation",
          protocols: ["proto_grief_bereavement_support", "proto_social_loneliness_intervention_pathway"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_practical_support_mutual_aid_plan",
          protocols: ["proto_caregiver_respite_social_support", "proto_social_loneliness_intervention_pathway"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "stress");
    expect(stack.review_required).toBe(false);
  });

  it("applies hearing, tinnitus, ear safety, and vestibular pathways", async () => {
    const protocols = library
      .allProtocols()
      .filter(
        (protocol) =>
          protocol.id.startsWith("proto_hearing_") ||
          protocol.id.startsWith("proto_tinnitus_") ||
          protocol.id.startsWith("proto_ear_") ||
          protocol.id.startsWith("proto_vestibular_")
      );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 72,
        flags: flagSet("clinician_managed hearing_concern hearing_loss communication_barrier device_interest mild_moderate_hearing_loss otc_hearing_aid_ok prescription_hearing_aid_candidate hearing_aid_user speech_in_noise_difficulty severe_hearing_loss poor_aided_speech_understanding loud_noise_exposure concerts power_tools occupational_noise very_high_noise_exposure firearms_noise headphone_use tinnitus bothersome_tinnitus tinnitus_distress tinnitus_sleep_impact pulsatile_tinnitus unilateral_tinnitus asymmetric_hearing_loss social_isolation ear_fullness cerumen_history cerumen_impaction qtip_use sudden_hearing_loss sudden_sensorineural_hearing_loss sudden_unilateral_hearing_loss acute_severe_dizziness neurologic_symptoms positional_vertigo bppv positive_dix_hallpike vestibular_hypofunction chronic_dizziness balance_problem vestibular_suppressant_use meclizine_use meniere_disease fluctuating_hearing_vertigo vestibular_migraine dizziness vertigo fall_risk")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_hearing_adult_loss_rehabilitation",
      "proto_hearing_noise_conservation_expanded",
      "proto_tinnitus_assessment_management",
      "proto_ear_cerumen_sudden_hearing_loss_safety",
      "proto_vestibular_vertigo_balance_rehab"
    ]);
    expectStackUnits(stack, [
      "iv_hearing_screening",
      "iv_hearing_needs_inventory_communication_goals",
      "iv_comprehensive_audiology_evaluation",
      "iv_otc_hearing_aid_trial_mild_moderate",
      "iv_prescription_hearing_aid_fitting",
      "iv_hearing_aid_real_ear_verification_followup",
      "iv_hearing_device_daily_use_maintenance",
      "iv_assistive_listening_device_setup",
      "iv_communication_strategy_training",
      "iv_cochlear_implant_evaluation",
      "iv_hearing_protection_earplugs",
      "iv_double_hearing_protection_high_noise",
      "iv_headphone_volume_limit",
      "iv_quiet_breaks_from_noise",
      "iv_baseline_audiogram",
      "iv_pulsatile_unilateral_tinnitus_red_flag_triage",
      "iv_tinnitus_impact_inventory",
      "iv_tinnitus_cbt_referral",
      "iv_tinnitus_sound_enrichment",
      "iv_tinnitus_hearing_aid_assessment",
      "iv_cerumen_otoscopy_hearing_aid_users",
      "iv_cerumenolytic_irrigation_manual_removal",
      "iv_ear_canal_foreign_object_qtip_avoidance",
      "iv_sudden_hearing_loss_urgent_ent_audiometry",
      "iv_sudden_sensorineural_hearing_loss_corticosteroid_review",
      "iv_dix_hallpike_bppv_assessment",
      "iv_canalith_repositioning_bppv",
      "iv_vestibular_rehab_referral",
      "iv_vestibular_suppressant_deprescribing_review",
      "iv_dizziness_neurologic_red_flag_triage",
      "iv_meniere_disease_diet_symptom_diary",
      "iv_meniere_audiovestibular_followup",
      "iv_vestibular_migraine_trigger_regularization_plan",
      "iv_fall_safety_plan_dizziness"
    ]);
    expect(unitCount(stack, "iv_comprehensive_audiology_evaluation")).toBe(1);
    expect(unitCount(stack, "iv_hearing_protection_earplugs")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_comprehensive_audiology_evaluation",
          protocols: [
            "proto_ear_cerumen_sudden_hearing_loss_safety",
            "proto_hearing_adult_loss_rehabilitation",
            "proto_hearing_noise_conservation_expanded",
            "proto_tinnitus_assessment_management"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_hearing_protection_earplugs",
          protocols: ["proto_hearing_noise_conservation_expanded", "proto_tinnitus_assessment_management"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_hearing_device_daily_use_maintenance",
          protocols: ["proto_hearing_adult_loss_rehabilitation", "proto_hearing_noise_conservation_expanded"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "pharmaceutical");
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(true);
  });

  it("applies occupational ergonomics, fatigue, psychosocial, and accommodation pathways", async () => {
    const protocols = protocolsByPrefix(library, "proto_workplace_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 49,
        flags: flagSet("workplace_health_focus desk_worker screen_work remote_worker keyboard_mouse_work eye_strain dry_eye neck_discomfort wrist_discomfort back_discomfort repetitive_computer_work data_entry sedentary_work prolonged_sitting static_posture sit_stand_desk workplace_activity_focus msd_symptoms ergonomic_training_needed new_workstation workplace_safety_feedback manual_handling_work lifting_work warehouse_worker heavy_lifting patient_handling high_risk_lifting_task cart_handling push_pull_work forceful_repetition repetitive_manual_work vibration_tool_use power_tool_work laboratory_worker pipetting_work microscope_work new_manual_task near_miss work_fatigue shift_worker night_shift rotating_shift long_work_hours overtime drowsy_driving safety_sensitive_work heavy_equipment driving_work fatigue_incident_risk work_stress burnout_risk excessive_workload low_job_control role_ambiguity low_work_support workplace_isolation workplace_bullying harassment workplace_violence_risk work_distress_impairment depression_focus anxiety_focus work_limiting_symptoms work_injury_recovery disability_accommodation_needed new_task_after_injury repetitive_work_trigger return_to_work_anxiety")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_workplace_office_ergonomics_screenwork",
      "proto_workplace_manual_handling_msd_prevention",
      "proto_workplace_fatigue_shiftwork_safety",
      "proto_workplace_psychosocial_stress_burnout_prevention",
      "proto_workplace_return_to_work_accommodation"
    ]);
    expectStackUnits(stack, [
      "iv_workstation_ergonomic_self_assessment",
      "iv_chair_worksurface_neutral_posture_setup",
      "iv_keyboard_mouse_neutral_wrist_setup",
      "iv_monitor_distance_height_glare_control",
      "iv_computer_microbreak_recovery_pauses",
      "iv_screen_eye_relief_20_20_20",
      "iv_task_rotation_job_enlargement",
      "iv_sit_stand_posture_variability",
      "iv_workplace_walking_activity_breaks",
      "iv_sitting_breaks",
      "iv_manual_material_handling_risk_assessment",
      "iv_assistive_lifting_device_or_team_lift",
      "iv_push_pull_cart_ergonomic_handling",
      "iv_forceful_repetition_job_rotation_controls",
      "iv_hand_arm_vibration_exposure_control",
      "iv_precision_laboratory_ergo_setup",
      "iv_work_fatigue_risk_screen",
      "iv_shift_work_sleep_opportunity_protection",
      "iv_extended_hours_recovery_and_commute_plan",
      "iv_safety_sensitive_fatigue_stop_work_plan",
      "iv_drowsy_driving_sleepiness_safety_plan",
      "iv_psychosocial_work_risk_inventory",
      "iv_workload_control_prioritization_checkin",
      "iv_supportive_supervisor_peer_support_checkin",
      "iv_workplace_connection_micropractice",
      "iv_workplace_bullying_harassment_escalation_plan",
      "iv_employee_mental_health_eap_referral",
      "iv_return_to_work_stay_at_work_accommodation_plan",
      "iv_early_msd_symptom_reporting_pathway",
      "iv_job_task_ergonomic_coaching",
      "iv_near_miss_discomfort_feedback_loop"
    ]);
    expect(unitCount(stack, "iv_early_msd_symptom_reporting_pathway")).toBe(1);
    expect(unitCount(stack, "iv_near_miss_discomfort_feedback_loop")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_early_msd_symptom_reporting_pathway",
          protocols: [
            "proto_workplace_manual_handling_msd_prevention",
            "proto_workplace_office_ergonomics_screenwork",
            "proto_workplace_return_to_work_accommodation"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_job_task_ergonomic_coaching",
          protocols: [
            "proto_workplace_manual_handling_msd_prevention",
            "proto_workplace_office_ergonomics_screenwork",
            "proto_workplace_return_to_work_accommodation"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_near_miss_discomfort_feedback_loop",
          protocols: [
            "proto_workplace_fatigue_shiftwork_safety",
            "proto_workplace_manual_handling_msd_prevention",
            "proto_workplace_office_ergonomics_screenwork",
            "proto_workplace_psychosocial_stress_burnout_prevention",
            "proto_workplace_return_to_work_accommodation"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_workload_control_prioritization_checkin",
          protocols: [
            "proto_workplace_fatigue_shiftwork_safety",
            "proto_workplace_psychosocial_stress_burnout_prevention"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical", false);
    expect(stack.review_required).toBe(false);
  });

  it("applies home and community injury-prevention pathways with emergency response composition", async () => {
    const protocols = protocolsByPrefix(library, "proto_injury_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        flags: flagSet("injury_prevention_focus transportation_safety_focus drives_or_rides_in_vehicle driver commuter distracted_driving_risk alcohol_user cannabis_user impairing_medications nightlife drowsy_driving sleep_deprived_driver shift_worker motorcycle_rider bicycle_rider scooter_rider walks_near_traffic night_walking pedestrian_commute parent_caregiver child_passenger child_transport water_safety_focus swim_skill_gap child_water_exposure boating open_water_swimming natural_water_activity weak_swimmer pool_owner home_pool child_home_pool_access water_recreation home_safety_focus fire_safety_focus homeowner family_household cooking_at_home burn_risk fire_extinguisher_available fuel_burning_appliance generator_use child_in_home small_child_home older_adult_medications cleaning_chemicals_home poisoning_risk button_battery_devices firearm_in_home firearm_access suicide_risk household_member_crisis overdose_risk opioid_exposure emergency_response_focus emergency_preparedness_focus high_risk_household remote_outdoor_activity high_risk_work_or_hobby disaster_risk_region power_outage_risk")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_injury_transportation_crash_prevention",
      "proto_injury_drowning_water_safety",
      "proto_injury_home_fire_burn_safety",
      "proto_injury_poison_firearm_home_safety",
      "proto_injury_bystander_emergency_response"
    ]);
    expectStackUnits(stack, [
      "iv_seat_belt_every_trip",
      "iv_child_passenger_restraint_check",
      "iv_distracted_driving_phone_free_mode",
      "iv_impaired_driving_ride_plan",
      "iv_drowsy_driving_sleepiness_safety_plan",
      "iv_motorcycle_bicycle_helmet_use",
      "iv_pedestrian_visibility_and_crossing_plan",
      "iv_swim_water_safety_lessons",
      "iv_life_jacket_boating_natural_water",
      "iv_close_constant_water_supervision",
      "iv_four_sided_pool_fence_gate",
      "iv_alcohol_avoidance_around_water",
      "iv_smoke_alarm_install_test",
      "iv_home_fire_escape_plan_drill",
      "iv_cooking_fire_prevention",
      "iv_burn_first_aid_cool_water_plan",
      "iv_fire_extinguisher_access_training",
      "iv_carbon_monoxide_detector",
      "iv_locked_medication_storage",
      "iv_household_chemical_locked_storage",
      "iv_poison_help_hotline_posting",
      "iv_button_battery_magnet_choking_hazard_control",
      "iv_firearm_secure_storage",
      "iv_ammunition_separate_locked_storage",
      "iv_lethal_means_safety_counseling",
      "iv_naloxone_overdose_rescue",
      "iv_cpr_aed_training",
      "iv_stop_the_bleed_training_kit",
      "iv_household_emergency_communication_plan",
      "iv_emergency_supply_kit",
      "iv_home_first_aid_kit_check"
    ]);
    expect(unitCount(stack, "iv_cpr_aed_training")).toBe(1);
    expect(unitCount(stack, "iv_poison_help_hotline_posting")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_cpr_aed_training",
          protocols: ["proto_injury_bystander_emergency_response", "proto_injury_drowning_water_safety"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_poison_help_hotline_posting",
          protocols: ["proto_injury_bystander_emergency_response", "proto_injury_poison_firearm_home_safety"],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes domestic food-safety, high-risk food choice, norovirus, cold-chain, and preservation pathways", async () => {
    const protocols = protocolsByPrefix(library, "proto_food_safety_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 68,
        sex: "female",
        pregnant: true,
        flags: flagSet("food_safety_focus cooking_at_home family_household produce_prep raw_meat_prep poultry_prep seafood_prep leftovers meal_prep frozen_food_prep high_risk_foodborne_illness high_risk_household immunocompromised young_child_home raw_milk_use raw_sprouts deli_meat_intake hot_dog_intake runny_egg_intake raw_egg_foods baking_with_children raw_cookie_dough_intake raw_oyster_intake raw_shellfish_intake pregnancy_food_safety_focus gastroenteritis_household norovirus_exposure vomiting_diarrhea food_worker shared_meal_prep vomit_cleanup acute_diarrhea outdoor_meals picnic cookout power_outage_risk generator_use emergency_preparedness_focus home_canning food_preservation low_acid_canning canned_food_damage food_allergy severe_allergy anaphylaxis_risk allergen_cross_contact_risk confirmed_celiac celiac_labeling_focus gluten_exposure_concern celiac_followup_due")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_food_safety_home_kitchen_foundation",
      "proto_food_safety_high_risk_safe_choices",
      "proto_food_safety_norovirus_gastro_outbreak_response",
      "proto_food_safety_recreation_emergency_cold_chain",
      "proto_food_safety_home_preservation_special_diets"
    ]);
    expectStackUnits(stack, [
      "iv_food_safety_handwashing_food_prep",
      "iv_food_contact_surface_sanitizing",
      "iv_fresh_produce_rinse_running_water",
      "iv_raw_meat_separation_cutting_boards",
      "iv_food_thermometer_safe_internal_temperature",
      "iv_refrigerator_thermometer_40f",
      "iv_prompt_refrigeration_two_hour_rule",
      "iv_leftover_label_use_freeze_window",
      "iv_safe_food_thawing_plan",
      "iv_food_recall_check_discard_plan",
      "iv_raw_milk_unpasteurized_dairy_avoidance",
      "iv_high_risk_sprout_avoid_or_cook",
      "iv_deli_meat_hot_dog_reheat_high_risk",
      "iv_egg_safety_cook_pasteurized",
      "iv_raw_flour_dough_batter_avoidance",
      "iv_raw_shellfish_oyster_avoidance_high_risk",
      "iv_pregnancy_listeria_food_safety",
      "iv_norovirus_food_prep_exclusion",
      "iv_norovirus_bleach_disinfection_cleanup",
      "iv_oral_rehydration_solution_diarrhea",
      "iv_picnic_cookout_cold_hot_holding",
      "iv_power_outage_refrigerated_food_discard_plan",
      "iv_home_canning_pressure_canner_low_acid",
      "iv_bulging_leaking_canned_food_discard",
      "iv_food_allergy_cross_contact_kitchen_control",
      "iv_food_allergen_avoidance_label_review",
      "iv_anaphylaxis_emergency_action_plan",
      "iv_gluten_free_label_verification_celiac",
      "iv_celiac_dietitian_followup"
    ]);
    expect(unitCount(stack, "iv_food_safety_handwashing_food_prep")).toBe(1);
    expect(unitCount(stack, "iv_food_thermometer_safe_internal_temperature")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_food_safety_handwashing_food_prep",
          protocols: [
            "proto_food_safety_home_kitchen_foundation",
            "proto_food_safety_norovirus_gastro_outbreak_response"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_food_thermometer_safe_internal_temperature",
          protocols: ["proto_food_safety_high_risk_safe_choices", "proto_food_safety_home_kitchen_foundation"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_refrigerator_thermometer_40f",
          protocols: [
            "proto_food_safety_home_kitchen_foundation",
            "proto_food_safety_recreation_emergency_cold_chain"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expect(stack.review_required).toBe(false);
  });

  it("composes pediatric and adolescent prevention across development, oral health, mental health, sexual health, school, and sports", async () => {
    const protocols = library
      .allProtocols()
      .filter((protocol) => protocol.id.startsWith("proto_pediatric_") || protocol.id.startsWith("proto_adolescent_"));
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 15,
        flags: flagSet("pediatric_prevention_focus adolescent adolescent_preventive_focus well_child_due infant toddler parent_caregiver child_development_focus developmental_concern developmental_screen_due autism_screen_due school_age_child hearing_concern vision_concern lead_exposure_risk old_home routine_vaccine_due adolescent_vaccine_due immunization_catchup newborn_home safe_sleep_focus child_passenger child_transport tooth_eruption child_oral_health_focus caries_risk_child child_lifestyle_focus child_sleep_focus adolescent_sleep_focus low_physical_activity_child screen_time_concern child_nutrition_focus high_bmi_child teen_mental_health_focus depression_screen_due anxiety_screen_due suicide_risk substance_use_risk vaping_risk sexually_active sti_risk hiv_screening_due sti_screening_due school_stress school_connectedness_focus bullying_concern youth_sports contact_sport concussion_concern bicycle_rider")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_pediatric_well_child_development_screening",
      "proto_pediatric_infant_oral_safety_prevention",
      "proto_pediatric_lifestyle_growth_sleep_activity",
      "proto_adolescent_preventive_mental_sexual_health",
      "proto_pediatric_school_sports_community_support"
    ]);
    expectStackUnits(stack, [
      "iv_pediatric_well_child_visit_schedule",
      "iv_pediatric_growth_bmi_tracking",
      "iv_developmental_surveillance_milestone_check",
      "iv_standardized_developmental_screening_9_18_30",
      "iv_autism_screening_18_24_months",
      "iv_pediatric_hearing_screening",
      "iv_pediatric_vision_screening",
      "iv_child_blood_lead_testing_risk_based",
      "iv_pediatric_social_needs_screening",
      "iv_child_adolescent_immunization_series",
      "iv_adolescent_hpv_tdap_menacwy_vaccine_review",
      "iv_infant_safe_sleep_environment",
      "iv_child_passenger_restraint_check",
      "iv_pediatric_dental_home_oral_health_risk_assessment",
      "iv_fluoride_varnish_primary_teeth",
      "iv_pediatric_fluoride_toothpaste_supervised_brushing",
      "iv_pediatric_sleep_duration_routine",
      "iv_child_adolescent_60min_physical_activity",
      "iv_family_media_plan_screen_time_sleep_protection",
      "iv_pediatric_nutrition_family_meals_beverage_plan",
      "iv_pediatric_obesity_intensive_behavioral_intervention",
      "iv_adolescent_depression_screening",
      "iv_child_adolescent_anxiety_screening",
      "iv_youth_suicide_risk_screening",
      "iv_adolescent_substance_use_screening_brief_intervention",
      "iv_adolescent_confidential_time_preventive_visit",
      "iv_adolescent_sti_behavioral_counseling",
      "iv_hiv_screening_universal",
      "iv_sti_panel_anatomic_site_screening",
      "iv_school_connectedness_adult_mentor_plan",
      "iv_youth_bullying_cyberbullying_screen_response",
      "iv_pediatric_sports_concussion_action_plan",
      "iv_concussion_gradual_return_activity",
      "iv_motorcycle_bicycle_helmet_use"
    ]);
    expect(unitCount(stack, "iv_pediatric_well_child_visit_schedule")).toBe(1);
    expect(unitCount(stack, "iv_child_adolescent_60min_physical_activity")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_pediatric_well_child_visit_schedule",
          protocols: [
            "proto_adolescent_preventive_mental_sexual_health",
            "proto_pediatric_infant_oral_safety_prevention",
            "proto_pediatric_well_child_development_screening"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_child_adolescent_60min_physical_activity",
          protocols: [
            "proto_pediatric_lifestyle_growth_sleep_activity",
            "proto_pediatric_school_sports_community_support"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_child_adolescent_immunization_series",
          protocols: [
            "proto_adolescent_preventive_mental_sexual_health",
            "proto_pediatric_infant_oral_safety_prevention",
            "proto_pediatric_well_child_development_screening"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledContains(stack.schedule.daily.scheduled_visit, "iv_pediatric_well_child_visit_schedule");
    expectCategory(stack, "oral");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes diabetes prevention, self-management, monitoring, safety, and complication surveillance", async () => {
    const protocols = protocolsByPrefix(library, "proto_diabetes_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 58,
        flags: flagSet("clinician_managed prediabetes diabetes_risk type2_prevention_focus gdm_history metabolic_syndrome overweight dpp_eligible diabetes type2_diabetes new_diabetes_diagnosis glycemic_control_focus postprandial_hyperglycemia carbohydrate_counting_needed low_physical_activity insulin_resistance glucose_focus diabetes_medication_use medication_access_barrier treatment_burden diabetes_distress burnout self_management_burden hypertension_focus elevated_office_bp ckd hypoglycemia_risk a1c_monitoring_due therapy_change insulin_use smbg_needed medication_hypoglycemia_risk cgm_candidate cgm_use glucose_variability type1_diabetes pump_candidate aid_candidate problematic_hypoglycemia sulfonylurea_use severe_hypoglycemia_history sick_day_plan_needed sglt2_inhibitor_use insulin_injections unexplained_glucose_variability pump_use travel emergency_preparedness_focus ascvd_risk diabetic_retinopathy diabetic_foot_risk neuropathy prior_foot_ulcer foot_deformity periodontal_risk poor_glycemic_control vaccine_review_due flu_vaccine_due covid_vaccine_due pneumococcal_risk hbv_vaccine_due hbv_nonimmune")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_diabetes_prediabetes_prevention_dpp",
      "proto_diabetes_self_management_lifestyle_foundation",
      "proto_diabetes_glycemic_monitoring_technology",
      "proto_diabetes_hypoglycemia_sick_day_insulin_safety",
      "proto_diabetes_complication_surveillance_cardiorenal_foot_eye_oral"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(37);
    expectStackUnits(stack, [
      "iv_prediabetes_risk_test_lab_confirmation",
      "iv_national_dpp_lifestyle_change_program",
      "iv_dpp_weight_loss_activity_goal",
      "iv_diabetes_self_management_education_support",
      "iv_diabetes_medical_nutrition_therapy",
      "iv_diabetes_carbohydrate_quality_consistency_plan",
      "iv_diabetes_activity_resistance_break_plan",
      "iv_postprandial_walk",
      "iv_diabetes_medication_taking_barrier_review",
      "iv_diabetes_individualized_glycemic_goal_review",
      "iv_diabetes_a1c_monitoring_cadence",
      "iv_self_monitoring_blood_glucose_plan",
      "iv_continuous_glucose_monitoring_use",
      "iv_cgm_time_in_range_agp_review",
      "iv_diabetes_hypoglycemia_15_15_rule",
      "iv_glucagon_rescue_prescription_training",
      "iv_diabetes_sick_day_ketone_plan",
      "iv_insulin_injection_technique_site_rotation",
      "iv_insulin_pump_automated_delivery_review",
      "iv_diabetes_device_supply_backup_plan",
      "iv_diabetes_distress_screening_support",
      "iv_creatinine_egfr",
      "iv_urine_albumin_creatinine_ratio",
      "iv_lipid_panel",
      "iv_home_blood_pressure_monitoring",
      "iv_diabetic_retinal_exam",
      "iv_diabetes_annual_foot_monofilament_exam",
      "iv_diabetic_foot_daily_inspection",
      "iv_diabetes_protective_footwear_podiatry_referral",
      "iv_diabetes_periodontal_care_coordination",
      "iv_diabetes_immunization_gap_review",
      "iv_influenza_vaccination",
      "iv_covid_vaccination",
      "iv_pneumococcal_vaccination",
      "iv_hepatitis_b_vaccination_liver_cancer_prevention"
    ]);
    expect(unitCount(stack, "iv_self_monitoring_blood_glucose_plan")).toBe(1);
    expect(unitCount(stack, "iv_continuous_glucose_monitoring_use")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_diabetes_medication_taking_barrier_review",
          protocols: ["proto_diabetes_glycemic_monitoring_technology", "proto_diabetes_self_management_lifestyle_foundation"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_self_monitoring_blood_glucose_plan",
          protocols: [
            "proto_diabetes_glycemic_monitoring_technology",
            "proto_diabetes_hypoglycemia_sick_day_insulin_safety"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_continuous_glucose_monitoring_use",
          protocols: [
            "proto_diabetes_glycemic_monitoring_technology",
            "proto_diabetes_hypoglycemia_sick_day_insulin_safety"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expect(stack.review_required).toBe(true);
  });

  it("composes cardiology protocols across heart failure, AF, coronary disease, rehab, and valve care", async () => {
    const protocols = protocolsByPrefix(library, "proto_cardiology_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 67,
        flags: flagSet("clinician_managed heart_failure hfref hfpef volume_overload congestion_history heart_failure_gdmt_review_due arni_candidate beta_blocker_candidate mra_candidate sglt2_candidate diuretic_needed hypotension_risk hypertension_focus hf_recent_hospitalization post_discharge stable_heart_failure hf_cardiac_rehab_candidate low_ef wide_qrs icd_crt_review_due advanced_heart_failure high_symptom_burden goals_of_care_review_due atrial_fibrillation suspected_af palpitations af_stroke_risk_review_due anticoagulation_candidate rapid_ventricular_response rate_control_needed rhythm_control_needed antiarrhythmic_candidate symptomatic_af ablation_candidate af_risk_factor_focus long_term_anticoagulation_contraindicated major_bleeding_history laao_candidate elevated_office_bp osa_risk snoring obesity coronary_disease angina chest_pain post_mi post_pci post_cabg stable_angina cardiac_rehab_candidate nitroglycerin_candidate antianginal_needed ascvd refractory_angina high_risk_ischemia revascularization_candidate return_to_activity_after_cardiac_event valvular_heart_disease aortic_stenosis mitral_regurgitation prosthetic_valve syncope exertional_chest_pain severe_aortic_stenosis symptomatic_aortic_stenosis valve_intervention_candidate mechanical_valve prior_endocarditis high_risk_endocarditis_condition invasive_dental_work_planned")
      }
    );

    const unitIds = stackUnitIds(stack);
    expectProtocolIdsInclude(protocols, [
      "proto_cardiology_heart_failure_self_management_gdmt",
      "proto_cardiology_atrial_fibrillation_stroke_rhythm_risk",
      "proto_cardiology_chronic_coronary_disease_angina_secondary_prevention",
      "proto_cardiology_cardiac_rehab_return_to_activity",
      "proto_cardiology_valvular_heart_disease_surveillance_intervention"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(35);
    expectStackUnits(stack, [
      "iv_heart_failure_daily_weight_symptom_zone_plan",
      "iv_heart_failure_sodium_fluid_self_management",
      "iv_heart_failure_gdmt_four_pillar_review",
      "iv_arni_hfref_therapy",
      "iv_hf_evidence_beta_blocker",
      "iv_mra_heart_failure",
      "iv_sglt2_inhibitor_cardiorenal",
      "iv_loop_diuretic_congestion_plan",
      "iv_heart_failure_post_discharge_followup_7day",
      "iv_heart_failure_cardiac_rehab_referral",
      "iv_icd_crt_eligibility_review",
      "iv_palliative_care_heart_failure_support",
      "iv_af_ecg_rhythm_documentation",
      "iv_af_stroke_bleeding_risk_review",
      "iv_af_rate_control_beta_blocker_ccb",
      "iv_af_rhythm_control_antiarrhythmic_review",
      "iv_af_catheter_ablation_evaluation",
      "iv_af_risk_factor_modification_bundle",
      "iv_left_atrial_appendage_occlusion_evaluation",
      "iv_cardiac_symptom_red_flag_triage",
      "iv_chronic_coronary_disease_cardiac_rehab",
      "iv_angina_action_plan_nitroglycerin_911",
      "iv_antianginal_beta_blocker_ccb_nitrate_review",
      "iv_chronic_coronary_antiplatelet_plan",
      "iv_high_intensity_statin",
      "iv_coronary_revascularization_ischemia_evaluation",
      "iv_valvular_heart_disease_echo_surveillance",
      "iv_aortic_stenosis_valve_team_referral",
      "iv_mechanical_valve_anticoagulation_inr_plan",
      "iv_infective_endocarditis_dental_prevention_review"
    ]);
    expect(unitIds).not.toContain("iv_doac_af_stroke_prevention");
    expect(unitCount(stack, "iv_home_blood_pressure_monitoring")).toBe(1);
    expect(unitCount(stack, "iv_cardiac_symptom_red_flag_triage")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_home_blood_pressure_monitoring",
          protocols: [
            "proto_cardiology_atrial_fibrillation_stroke_rhythm_risk",
            "proto_cardiology_cardiac_rehab_return_to_activity",
            "proto_cardiology_chronic_coronary_disease_angina_secondary_prevention",
            "proto_cardiology_heart_failure_self_management_gdmt"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_heart_failure_cardiac_rehab_referral",
          protocols: [
            "proto_cardiology_cardiac_rehab_return_to_activity",
            "proto_cardiology_heart_failure_self_management_gdmt"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_cardiac_symptom_red_flag_triage",
          protocols: [
            "proto_cardiology_cardiac_rehab_return_to_activity",
            "proto_cardiology_chronic_coronary_disease_angina_secondary_prevention",
            "proto_cardiology_valvular_heart_disease_surveillance_intervention"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_chronic_coronary_disease_cardiac_rehab",
          protocols: [
            "proto_cardiology_cardiac_rehab_return_to_activity",
            "proto_cardiology_chronic_coronary_disease_angina_secondary_prevention"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledIncludes(stack.schedule.weekly.scheduled_session, ["iv_chronic_coronary_disease_cardiac_rehab", "iv_heart_failure_cardiac_rehab_referral"]);
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes rheumatology and autoimmune protocols across RA, gout, SpA, lupus, and immunosuppression safety", async () => {
    const protocols = protocolsByPrefix(library, "proto_rheum_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 55,
        sex: "female",
        pregnant: false,
        flags: flagSet("clinician_managed inflammatory_arthritis suspected_ra persistent_synovitis rheumatoid_arthritis ra_active methotrexate_candidate methotrexate_use ra_hand_function_limit hand_synovitis csdmard_escalation_needed active_ra_despite_mtx biologic_dmard_candidate active_ra_despite_csdmard dmard_use pregnancy_possible teratogenic_dmard_use gout hyperuricemia_monitoring ult_candidate tophi recurrent_gout_flares ckd allopurinol_candidate hla_b5801_risk_ancestry high_risk_allopurinol gout_flare flare_plan_needed starting_ult ult_titration hyperuricemia metabolic_syndrome colchicine_candidate psoriatic_arthritis psoriasis_joint_pain dactylitis enthesitis psoriasis tnf_biologic_candidate interleukin_biologic_candidate axial_spa inflammatory_back_pain ankylosing_spondylitis axial_spa_biologic_candidate uveitis_history ibd sle lupus hydroxychloroquine_candidate hydroxychloroquine_use glucocorticoid_use active_sle steroid_toxicity_risk biologic_sle_candidate lupus_nephritis proteinuria nephritis_immunosuppression_candidate immunosuppression targeted_dmard_candidate vaccine_review_due flu_vaccine_due covid_vaccine_due zoster_vaccine_due pneumococcal_risk chronic_glucocorticoid high_fracture_risk oral_bisphosphonate_ok")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_rheum_ra_inflammatory_arthritis_treat_to_target",
      "proto_rheum_gout_urate_lowering_flare_prevention",
      "proto_rheum_psoriatic_axial_spondyloarthritis",
      "proto_rheum_sle_lupus_nephritis_steroid_sparing",
      "proto_rheum_immunosuppression_safety_bone_vaccine"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(41);
    expectStackUnits(stack, [
      "iv_ra_disease_activity_treat_to_target",
      "iv_methotrexate_ra_dmard",
      "iv_ra_consistent_exercise_rehab_plan",
      "iv_dmard_lab_safety_monitoring",
      "iv_allopurinol_urate_lowering_therapy",
      "iv_gout_flare_colchicine_nsaid_steroid_plan",
      "iv_psa_domain_activity_assessment",
      "iv_axial_spa_nsaid_exercise_plan",
      "iv_hydroxychloroquine_sle_therapy",
      "iv_lupus_nephritis_combo_immunosuppression_review",
      "iv_rheum_immunization_medication_timing_review",
      "iv_glucocorticoid_induced_osteoporosis_risk_dxa",
      "iv_oral_bisphosphonate"
    ]);
    expect(unitCount(stack, "iv_creatinine_egfr")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_dmard_lab_safety_monitoring",
          protocols: [
            "proto_rheum_immunosuppression_safety_bone_vaccine",
            "proto_rheum_ra_inflammatory_arthritis_treat_to_target"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_creatinine_egfr",
          protocols: [
            "proto_rheum_gout_urate_lowering_flare_prevention",
            "proto_rheum_sle_lupus_nephritis_steroid_sparing"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_rheum_biologic_infection_screening",
          protocols: [
            "proto_rheum_immunosuppression_safety_bone_vaccine",
            "proto_rheum_psoriatic_axial_spondyloarthritis"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledContains(stack.schedule.weekly.weekly_medication_day, "iv_methotrexate_ra_dmard");
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes hematology protocols across anemia, VTE, anticoagulation safety, transfusion, ITP, and sickle cell care", async () => {
    const protocols = protocolsByPrefix(library, "proto_hematology_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 42,
        sex: "female",
        pregnant: true,
        flags: flagSet("clinician_managed anemia low_hemoglobin macrocytosis microcytosis anemia_workup iron_deficiency low_ferritin iron_deficiency_anemia gi_bleeding postmenopausal recurrent_iron_deficiency oral_iron_failed malabsorption rapid_iron_repletion_needed ibd ckd b12_deficiency_risk neuropathy vegan metformin_use ppi_use b12_deficiency pernicious_anemia folate_deficiency low_folate hemolysis_suspected jaundice_anemia dark_urine_anemia high_reticulocytes chronic_inflammation cancer normocytic_anemia suspected_vte suspected_dvt suspected_pe leg_swelling_pain vte_imaging_needed dyspnea_chest_pain_vte vte anticoagulation_candidate doac_candidate active_cancer lmwh_preferred recent_dvt recent_pe extended_anticoagulation_review_due post_thrombotic_syndrome unprovoked_vte recurrent_vte family_history_vte thrombophilia_testing_requested anticoagulant_use doac_use warfarin_use lmwh_use bleeding_risk thrombocytopenia major_bleeding anticoagulant_reversal_needed emergency_procedure_anticoagulated heparin_exposure platelet_drop new_thrombosis_on_heparin transfusion_considered preprocedure_anemia patient_blood_management severe_anemia inpatient_anemia elective_surgery_planned high_blood_loss_procedure transfusion_history chronic_transfusion itp easy_bruising mucosal_bleeding itp_treatment_indicated low_platelets_bleeding_risk active_bleeding urgent_procedure rapid_platelet_rise_needed persistent_itp chronic_itp steroid_dependent_itp sickle_cell_disease scd functional_asplenia pneumococcal_risk flu_vaccine_due child_under_five hydroxyurea_candidate recurrent_vaso_occlusive_pain acute_chest_history hydroxyurea_use child_scd tcd_screen_due hbss abnormal_tcd prior_sickle_stroke chronic_transfusion_candidate cognitive_concern silent_infarct_screen_due prior_silent_infarct vaso_occlusive_pain")
      }
    );
    const unitIds = stackUnitIds(stack);

    expectProtocolIdsInclude(protocols, [
      "proto_hematology_anemia_iron_b12_folate_workup_repletion",
      "proto_hematology_vte_diagnosis_treatment_secondary_prevention",
      "proto_hematology_anticoagulation_bleeding_hit_safety",
      "proto_hematology_transfusion_patient_blood_management",
      "proto_hematology_itp_thrombocytopenia_bleeding",
      "proto_hematology_sickle_cell_health_stroke_transfusion"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(42);
    expectStackUnits(stack, [
      "iv_anemia_cbc_indices_reticulocyte_review",
      "iv_iron_studies_ferritin_tsat",
      "iv_intravenous_iron_repletion",
      "iv_b12_mma_homocysteine_evaluation",
      "iv_lmwh_vte_pregnancy_cancer_context",
      "iv_vte_duration_recurrence_bleeding_review",
      "iv_major_bleeding_reversal_pathway",
      "iv_hit_4ts_score_pf4_testing",
      "iv_restrictive_rbc_transfusion_threshold_review",
      "iv_itp_tpo_receptor_agonist_review",
      "iv_sickle_cell_hydroxyurea_disease_modifying_therapy",
      "iv_sickle_cell_chronic_transfusion_stroke_prevention"
    ]);
    expect(unitIds).not.toContain("iv_vte_doac_anticoagulation_therapy");
    expect(unitCount(stack, "iv_complete_blood_count")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_complete_blood_count",
          protocols: [
            "proto_hematology_anemia_iron_b12_folate_workup_repletion",
            "proto_hematology_anticoagulation_bleeding_hit_safety",
            "proto_hematology_itp_thrombocytopenia_bleeding",
            "proto_hematology_sickle_cell_health_stroke_transfusion",
            "proto_hematology_transfusion_patient_blood_management",
            "proto_hematology_vte_diagnosis_treatment_secondary_prevention"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_anticoagulant_medication_reconciliation_interaction_review",
          protocols: [
            "proto_hematology_anticoagulation_bleeding_hit_safety",
            "proto_hematology_vte_diagnosis_treatment_secondary_prevention"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_transfusion_type_screen_antibody_history",
          protocols: [
            "proto_hematology_sickle_cell_health_stroke_transfusion",
            "proto_hematology_transfusion_patient_blood_management"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledContains(stack.schedule.weekly.transfusion_visit, "iv_sickle_cell_chronic_transfusion_stroke_prevention");
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes vascular medicine protocols across PAD, aortic, carotid, venous, and lymphedema care", async () => {
    const protocols = protocolsByPrefix(library, "proto_vascular_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 70,
        sex: "male",
        pregnant: false,
        flags: flagSet("clinician_managed suspected_pad pad claudication diminished_pulses exertional_leg_symptoms noncompressible_arteries resting_abi_nondiagnostic post_lower_extremity_revascularization high_limb_event_risk hypertension_focus elevated_office_bp tobacco_user nrt_ok varenicline_ok walking_limitation cilostazol_candidate diabetes foot_ulcer_risk diabetic_foot_risk foot_deformity clti rest_pain tissue_loss nonhealing_foot_wound foot_infection revascularization_candidate failed_exercise_gdmt bypass_graft post_pad_stent ever_smoker aaa_screen_due aaa abdominal_aortic_aneurysm aaa_surveillance_due thoracic_aortic_aneurysm aortic_root_dilation bicuspid_aortic_valve_aortopathy post_aortic_repair sudden_severe_chest_back_pain suspected_aortic_dissection malperfusion_symptoms symptomatic_aneurysm aortic_aneurysm aortic_dissection_history genetic_aortopathy aortic_atherosclerosis ascvd family_history_aortic_dissection early_aortic_disease large_aortic_aneurysm rapid_aortic_growth aortic_repair_candidate post_aortic_repair_complication carotid_stenosis carotid_bruit tia ischemic_stroke symptomatic_carotid_stenosis carotid_atherosclerosis carotid_revascularization_candidate varicose_veins venous_insufficiency venous_leg_ulcer leg_heaviness_swelling compression_preferred axial_reflux venous_intervention_candidate venous_ulcer nonhealing_leg_wound wound_care_needed superficial_venous_reflux compression_candidate mixed_arterial_venous_ulcer lymphedema chronic_limb_edema lymphedema_symptoms radiation_lymphedema_risk moderate_lymphedema cdt_candidate compression_garment_candidate cellulitis_history obesity lymphedema_exercise_focus", { high_bleeding_risk: false, heart_failure: false })
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_vascular_pad_diagnosis_medical_exercise_limb_care",
      "proto_vascular_aortic_aneurysm_dissection_surveillance_repair",
      "proto_vascular_carotid_stenosis_stroke_prevention",
      "proto_vascular_chronic_venous_disease_varicose_ulcer",
      "proto_vascular_lymphedema_chronic_edema_self_management"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(37);
    expectStackUnits(stack, [
      "iv_pad_abi_diagnostic_testing",
      "iv_pad_supervised_exercise_therapy",
      "iv_dual_pathway_inhibition_pad_review",
      "iv_cilostazol_claudication",
      "iv_clti_wound_ischemia_infection_triage",
      "iv_pad_revascularization_evaluation",
      "iv_aaa_ultrasound_screening",
      "iv_aortic_ct_mri_surveillance",
      "iv_acute_aortic_syndrome_emergency_triage",
      "iv_aortic_repair_referral",
      "iv_carotid_duplex_ultrasound_stenosis_evaluation",
      "iv_carotid_revascularization_evaluation",
      "iv_endovenous_ablation_varicose_veins",
      "iv_venous_leg_ulcer_multicomponent_compression",
      "iv_complete_decongestive_therapy_lymphedema",
      "iv_lymphedema_skin_care_infection_prevention"
    ]);
    expect(unitCount(stack, "iv_high_intensity_statin")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_pad_abi_diagnostic_testing",
          protocols: [
            "proto_vascular_chronic_venous_disease_varicose_ulcer",
            "proto_vascular_pad_diagnosis_medical_exercise_limb_care"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_high_intensity_statin",
          protocols: [
            "proto_vascular_aortic_aneurysm_dissection_surveillance_repair",
            "proto_vascular_carotid_stenosis_stroke_prevention",
            "proto_vascular_pad_diagnosis_medical_exercise_limb_care"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_home_blood_pressure_monitoring",
          protocols: [
            "proto_vascular_aortic_aneurysm_dissection_surveillance_repair",
            "proto_vascular_carotid_stenosis_stroke_prevention",
            "proto_vascular_pad_diagnosis_medical_exercise_limb_care"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_venous_compression_conservative_plan",
          protocols: [
            "proto_vascular_chronic_venous_disease_varicose_ulcer",
            "proto_vascular_lymphedema_chronic_edema_self_management"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledContains(stack.schedule.weekly.scheduled_session, "iv_pad_supervised_exercise_therapy");
    expect(stack.evidence_summary.A + stack.evidence_summary.B).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes cardiometabolic risk protocols across ASCVD, CKM, obesity, dyslipidemia, and MASLD care", async () => {
    const protocols = protocolsByPrefix(library, "proto_cardiometabolic_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 58,
        sex: "female",
        pregnant: false,
        flags: flagSet("clinician_managed ckm_risk_focus high_ascvd_risk ldl_focus hypertriglyceridemia triglycerides_high metabolic_syndrome diabetes type2_diabetes ckd ascvd obesity overweight central_adiposity insulin_resistance prediabetes hypertension_focus elevated_office_bp osa_risk snoring resistant_hypertension medication_access_barrier food_insecurity family_history_premature_ascvd intermediate_ascvd_risk borderline_ascvd_risk chronic_inflammatory_condition autoimmune_disease preeclampsia_history premature_menopause south_asian_ancestry severe_hypercholesterolemia ldl_c_190_or_higher xanthomas statin_decision_uncertain lipid_treatment statin_use lipid_medication_change primary_prevention_statin_candidate very_high_ascvd_risk additional_ldl_lowering_needed statin_intolerant statin_muscle_symptoms atherogenic_dyslipidemia discordant_lipids obesity_pharmacotherapy_candidate established_cvd weight_related_condition type2_prevention_focus lifestyle_program_preferred moderate_severe_osa bariatric_surgery_candidate severe_obesity severe_weight_related_complication metabolic_disease bmi_30_349 non_surgical_treatment_inadequate fatty_liver masld nafld fib4_elevated fib4_indeterminate advanced_fibrosis_risk persistent_alt_elevation alcohol_user caffeine_ok", { insomnia: false, gerd: false })
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_cardiometabolic_advanced_ascvd_risk_stratification",
      "proto_cardiometabolic_dyslipidemia_treatment_monitoring",
      "proto_cardiometabolic_ckm_metabolic_syndrome_staging",
      "proto_cardiometabolic_obesity_complication_escalation",
      "proto_cardiometabolic_masld_fibrosis_lifestyle"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(43);
    expectStackUnits(stack, [
      "iv_prevent_ascvd_ckm_risk_calculation",
      "iv_lpa_test",
      "iv_apob_test",
      "iv_ascvd_risk_enhancer_review",
      "iv_coronary_artery_calcium_score_selective",
      "iv_lipid_therapy_response_adherence_monitoring",
      "iv_statin_intolerance_rechallenge_plan",
      "iv_hypertriglyceridemia_secondary_cause_review",
      "iv_ckm_syndrome_stage_assessment",
      "iv_metabolic_syndrome_criteria_review",
      "iv_obesity_complication_staging_review",
      "iv_metabolic_bariatric_surgery_referral",
      "iv_liver_fibrosis_fib4_screen",
      "iv_masld_elastography_elf_secondary_assessment",
      "iv_masld_weight_loss_target_plan",
      "iv_masld_alcohol_minimization_review",
      "iv_masld_coffee_if_tolerated"
    ]);
    expect(unitCount(stack, "iv_lipid_panel")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_lipid_panel",
          protocols: [
            "proto_cardiometabolic_advanced_ascvd_risk_stratification",
            "proto_cardiometabolic_dyslipidemia_treatment_monitoring",
            "proto_cardiometabolic_masld_fibrosis_lifestyle"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_waist_circumference_tracking",
          protocols: [
            "proto_cardiometabolic_ckm_metabolic_syndrome_staging",
            "proto_cardiometabolic_obesity_complication_escalation"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_hba1c_screening",
          protocols: [
            "proto_cardiometabolic_ckm_metabolic_syndrome_staging",
            "proto_cardiometabolic_masld_fibrosis_lifestyle"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledContains(stack.schedule.daily.scheduled_imaging, "iv_coronary_artery_calcium_score_selective");
    expect(stack.evidence_summary.A + stack.evidence_summary.B + stack.evidence_summary.C).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("composes eating-disorder and RED-S protocols with safety-first collisions", async () => {
    const protocols = protocolsByPrefix(library, "proto_eating_disorder_");
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        age: 17,
        sex: "female",
        pregnant: false,
        goal: "eating_disorder_reds_recovery",
        goal_pole: "medical_safety_and_recovery",
        flags: flagSet("clinician_managed eating_disorder_risk restrictive_eating anorexia_nervosa underweight rapid_weight_loss bradycardia orthostatic_symptoms syncope electrolyte_abnormality purging self_induced_vomiting laxative_misuse dental_erosion amenorrhea low_bone_density_risk suicide_risk self_harm family_available binge_eating bed binge_eating_disorder bulimia_nervosa fluoxetine_candidate arfid selective_eating nutritional_deficiency growth_faltering low_energy_availability reds athlete female_athlete_triad high_training_load return_to_sport_needed compulsive_exercise severe_meal_anxiety weight_restoration_stalled weight_loss_goal obesity metabolic_syndrome")
      }
    );
    expectProtocolIdsInclude(protocols, [
      "proto_eating_disorder_restrictive_anorexia_medical_rehabilitation",
      "proto_eating_disorder_bulimia_purging_safety_recovery",
      "proto_eating_disorder_binge_eating_behavioral_pharmacology",
      "proto_eating_disorder_arfid_feeding_growth_nutrition",
      "proto_eating_disorder_reds_athlete_energy_availability",
      "proto_eating_disorder_weight_neutral_obesity_intersection"
    ]);
    expect(stack.units.length).toBeGreaterThanOrEqual(23);
    expectStackUnits(stack, [
      "iv_eating_disorder_scoff_screen",
      "iv_eating_disorder_medical_instability_triage",
      "iv_restrictive_eating_vitals_weight_growth_labs_monitoring",
      "iv_purging_electrolyte_ecg_monitoring",
      "iv_eating_disorder_dietitian_nutritional_rehabilitation",
      "iv_eating_disorder_regular_eating_meal_pattern",
      "iv_eating_disorder_family_based_treatment_adolescent",
      "iv_enhanced_cbt_e_eating_disorder",
      "iv_fluoxetine_bulimia_nervosa",
      "iv_olanzapine_anorexia_weight_anxiety_review",
      "iv_arfid_exposure_based_feeding_therapy",
      "iv_reds_low_energy_availability_screen",
      "iv_reds_energy_availability_restore_plan",
      "iv_reds_training_load_modification",
      "iv_reds_return_to_sport_risk_stratification",
      "iv_eating_disorder_weight_neutral_care_plan"
    ]);
    expect(unitCount(stack, "iv_eating_disorder_scoff_screen")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_eating_disorder_scoff_screen",
          protocols: [
            "proto_eating_disorder_arfid_feeding_growth_nutrition",
            "proto_eating_disorder_binge_eating_behavioral_pharmacology",
            "proto_eating_disorder_bulimia_purging_safety_recovery",
            "proto_eating_disorder_reds_athlete_energy_availability",
            "proto_eating_disorder_restrictive_anorexia_medical_rehabilitation",
            "proto_eating_disorder_weight_neutral_obesity_intersection"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_eating_disorder_medical_instability_triage",
          protocols: [
            "proto_eating_disorder_arfid_feeding_growth_nutrition",
            "proto_eating_disorder_bulimia_purging_safety_recovery",
            "proto_eating_disorder_reds_athlete_energy_availability",
            "proto_eating_disorder_restrictive_anorexia_medical_rehabilitation",
            "proto_eating_disorder_weight_neutral_obesity_intersection"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_eating_disorder_regular_eating_meal_pattern",
          protocols: [
            "proto_eating_disorder_binge_eating_behavioral_pharmacology",
            "proto_eating_disorder_bulimia_purging_safety_recovery",
            "proto_eating_disorder_restrictive_anorexia_medical_rehabilitation",
            "proto_eating_disorder_weight_neutral_obesity_intersection"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );
    expectScheduledContains(stack.schedule.daily.urgent_visit, "iv_eating_disorder_medical_instability_triage");
    expectScheduledIncludes(stack.schedule.weekly.scheduled_session, ["iv_eating_disorder_family_based_treatment_adolescent", "iv_enhanced_cbt_e_eating_disorder"]);
    expect(stack.evidence_summary.A + stack.evidence_summary.B + stack.evidence_summary.C).toBe(stack.units.length);
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expect(stack.review_required).toBe(true);
  });

  it("apply returns a valid stack with schedule and evidence summary", async () => {
    const stack = applyTest(library.allProtocols());

    expect(PersonalizedStackSchema.safeParse(stack).success).toBe(true);
    expect(stack.units.length).toBeGreaterThan(0);
    expect(Object.keys(stack.schedule.daily).length + Object.keys(stack.schedule.weekly).length).toBeGreaterThan(0);
    expect(Object.values(stack.evidence_summary).reduce((sum, count) => sum + count, 0)).toBe(stack.units.length);
  });

  it("drops a conditional action when false and keeps it when true", async () => {
    const nutrition = requiredProtocol(library, "proto_blueprint_nutrition");

    const dropped = applyTest([nutrition]);
    expectUnitAbsent(dropped, "iv_creatine");

    const kept = applyTest([nutrition], { ...baseProfile, goal: "muscle_gain" });
    expectUnitPresent(kept, "iv_creatine");
  });

  it("sets review_required when a pharmaceutical unit is present", async () => {
    const hair = requiredProtocol(library, "proto_blueprint_hair");
    const stack = applyTest([hair]);

    expectUnitPresent(stack, "iv_oral_minoxidil");
    expect(stack.review_required).toBe(true);
  });

  it("composes hair and scalp protocols with diagnosis, regrowth, infection, and scarring guardrails", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_hair_loss_evaluation_foundation",
      "proto_hair_androgenetic_alopecia",
      "proto_hair_alopecia_areata",
      "proto_hair_traction_scarring_alopecia",
      "proto_hair_scalp_inflammatory_infectious"
    );
    const stack = applyTest(
      protocols,
      {
        ...baseProfile,
        sex: "male",
        age: 42,
        goal: "hair_scalp_health",
        flags: flagSet("clinician_managed hair_loss hair_shedding alopecia hair_density_goal androgenetic_alopecia male_pattern_hair_loss topical_minoxidil_candidate finasteride_candidate oral_minoxidil_candidate light_device_ok prp_hair_candidate hair_transplant_interest alopecia_areata patchy_hair_loss sudden_hair_loss patchy_alopecia_areata intralesional_steroid_candidate minoxidil_adjunct_candidate severe_alopecia_areata jak_inhibitor_candidate traction_alopecia tight_hairstyles hairline_tension scarring_alopecia ccca scalp_pain loss_of_follicular_openings scarring_alopecia_treatment_candidate scalp_flaking scalp_itch dandruff seborrheic_dermatitis refractory_dandruff ketoconazole_candidate scalp_psoriasis psoriasis scalp_psoriasis_topical_candidate tinea_capitis_suspected")
      }
    );
    expect(stack.units).toHaveLength(18);
    expectStackUnits(stack, [
      "iv_hair_loss_history_scalp_exam",
      "iv_hair_loss_photo_density_tracking",
      "iv_topical_minoxidil_hair_regrowth",
      "iv_finasteride_male_pattern_hair_loss",
      "iv_oral_minoxidil",
      "iv_alopecia_areata_jak_inhibitor_review",
      "iv_traction_alopecia_low_tension_hair_practices",
      "iv_scarring_alopecia_red_flag_biopsy_referral",
      "iv_ketoconazole_ciclopirox_scalp_antifungal_review",
      "iv_tinea_capitis_oral_antifungal_referral"
    ]);
    expect(stack.evidence_summary).toEqual({ A: 11, B: 6, C: 1, D: 0 });
    expect(stack.review_required).toBe(true);
    expectCategory(stack, "hair");
    expectCategory(stack, "light");
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expectScheduledContains(stack.schedule.daily.clinical_visit, "iv_hair_loss_history_scalp_exam");
    expectScheduledIncludes(stack.schedule.weekly.hair_wash, [
      "iv_ketoconazole_ciclopirox_scalp_antifungal_review",
      "iv_seborrheic_dermatitis_dandruff_shampoo_rotation"
    ]);
    expect(unitCount(stack, "iv_topical_minoxidil_hair_regrowth")).toBe(1);
    expect(stack.validation.collisions).toContainEqual({
      unit_id: "iv_topical_minoxidil_hair_regrowth",
      protocols: [
      "proto_hair_alopecia_areata",
      "proto_hair_androgenetic_alopecia",
      "proto_hair_traction_scarring_alopecia"
      ],
      resolution: "deduped canonical unit by id"
    });
  });

  it("composes contraception protocols with eligibility, LARC, emergency, hormonal, and permanent method guardrails", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_contraception_foundation_medical_eligibility",
      "proto_contraception_larc_iud_implant",
      "proto_contraception_hormonal_methods",
      "proto_contraception_emergency_contraception",
      "proto_contraception_nonhormonal_permanent_methods"
    );
    const profile = {
      ...baseProfile,
      user_id: "u_test_contraception",
      goal: "contraception_reproductive_autonomy",
      goal_pole: "reproductive_autonomy",
      sex: "female" as const,
      age: 31,
      flags: flagSet("clinician_managed contraception_focus birth_control_counseling_due pregnancy_prevention_focus method_change_desired contraception_start quick_start_contraception chc_interest estrogen_contraception_interest hormonal_contraception_interest pop_interest dmpa_interest injection_contraception_interest dmpa_use bone_density_concern method_side_effects contraception_followup_due hormonal_method_followup_due sexually_active sti_prevention_focus new_partner dual_method_interest larc_interest iud_interest implant_interest copper_iud_interest nonhormonal_iud_interest levonorgestrel_iud_interest hormonal_iud_interest heavy_menses low_maintenance_contraception emergency_contraception_need ec_advance_access unprotected_sex contraceptive_failure levonorgestrel_ec_candidate ulipristal_ec_candidate ec_copper_iud_candidate ongoing_contraception_after_ec nonhormonal_contraception_interest barrier_method_interest fertility_awareness_interest behavioral_contraception_interest postpartum lam_interest exclusive_breastfeeding permanent_contraception_interest vasectomy_interest tubal_permanent_contraception_interest")
    };
    const stack = applyTest(protocols, profile);
    expect(stack.units).toHaveLength(19);
    expectStackUnits(stack, [
      "iv_contraceptive_goal_medical_eligibility_review",
      "iv_pregnancy_exclusion_quick_start_contraception",
      "iv_combined_hormonal_contraception_risk_screen",
      "iv_copper_iud_larc",
      "iv_levonorgestrel_iud_larc",
      "iv_etonogestrel_implant_larc",
      "iv_combined_hormonal_contraception_general",
      "iv_progestin_only_pill_contraception",
      "iv_depot_medroxyprogesterone_contraception",
      "iv_emergency_contraception_access_plan",
      "iv_levonorgestrel_emergency_contraception",
      "iv_ulipristal_emergency_contraception",
      "iv_fertility_awareness_method_instruction",
      "iv_lactational_amenorrhea_method_criteria",
      "iv_permanent_contraception_counseling"
    ]);
    expect(stack.evidence_summary).toEqual({ A: 12, B: 6, C: 1, D: 0 });
    expect(stack.cost_per_month_usd).toBe(139);
    expect(stack.review_required).toBe(true);
    expectCategory(stack, "measurement");
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expectScheduledIncludes(stack.schedule.daily.insertion_visit, ["iv_copper_iud_larc", "iv_levonorgestrel_iud_larc", "iv_etonogestrel_implant_larc"]);
    expectScheduledIncludes(stack.schedule.daily.after_unprotected_sex, ["iv_levonorgestrel_emergency_contraception", "iv_ulipristal_emergency_contraception"]);
    expect(unitCount(stack, "iv_copper_iud_larc")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_copper_iud_larc",
          protocols: ["proto_contraception_emergency_contraception", "proto_contraception_larc_iud_implant"],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_contraceptive_goal_medical_eligibility_review",
          protocols: [
            "proto_contraception_foundation_medical_eligibility",
            "proto_contraception_hormonal_methods",
            "proto_contraception_larc_iud_implant",
            "proto_contraception_nonhormonal_permanent_methods"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );

    const dropped = applyTest(requiredProtocols(library, "proto_contraception_emergency_contraception"));
    expectUnitAbsent(dropped, "iv_ulipristal_emergency_contraception");

    const kept = applyTest(
      requiredProtocols(library, "proto_contraception_emergency_contraception"),
      {
        ...baseProfile,
        flags: flagSet("clinician_managed emergency_contraception_need unprotected_sex ulipristal_ec_candidate")
      }
    );
    expectUnitPresent(kept, "iv_ulipristal_emergency_contraception");
    expect(kept.review_required).toBe(true);
  });

  it("composes immunization operations with catch-up, pregnancy, high-risk, occupational, and travel guardrails", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_immunization_foundation_schedule_catchup",
      "proto_immunization_pregnancy_perinatal_timing",
      "proto_immunization_immunocompromised_asplenia_highrisk",
      "proto_immunization_healthcare_personnel_occupational",
      "proto_immunization_travel_outbreak_accelerated"
    );
    const profile = {
      ...baseProfile,
      user_id: "u_test_immunization",
      goal: "immunization_prevention",
      goal_pole: "immune_resilience",
      sex: "female" as const,
      pregnant: true,
      age: 56,
      flags: flagSet("clinician_managed vaccine_review_due vaccine_due immunization_catchup unknown_vaccine_history incomplete_vaccine_series multiple_vaccines_due shared_decision_vaccine borderline_vaccine_risk vaccine_hesitancy_discussion live_vaccine_candidate prior_vaccine_reaction preconception pregnancy_planning postpartum pregnancy_vaccine_review_due rsv_maternal_window rsv_vaccine_due rubella_varicella_immunity_unknown hbv_nonimmune hbv_vaccine_due newborn_household household_vulnerable_contact immunocompromised immunosuppressed chemotherapy transplant_candidate biologic_therapy_candidate jak_inhibitor_candidate methotrexate_use high_dose_steroid_use asplenia complement_deficiency complement_inhibitor chronic_liver_disease diabetes ckd pneumococcal_risk zoster_vaccine_due meningococcal_vaccine_due hib_vaccine_due hsct chronic_lung_disease chronic_heart_disease flu_vaccine_due covid_vaccine_due healthcare_personnel occupational_vaccine_review lab_worker blood_body_fluid_exposure_risk hbv_vaccine_nonresponder_review tdap_due tetanus_booster_due wound_tetanus_risk mmr_nonimmune varicella_nonimmune meningococcal_lab_worker rabies_lab_worker animal_worker international_travel travel_vaccine_review last_minute_travel accelerated_vaccine_schedule yellow_fever_travel_risk yellow_fever_certificate_required cholera_travel_risk outbreak_exposure vaccine_preventable_exposure measles_exposure hepatitis_a_exposure mpox_exposure hepa_travel_risk hbv_travel_risk polio_travel_risk typhoid_travel_risk japanese_encephalitis_travel_risk rabies_travel_risk tick_borne_encephalitis_travel_risk mpox_risk mpox_vaccine_eligible hpv_vaccine_due hpv_vaccine_candidate rsv_high_risk")
    };
    const stack = applyTest(protocols, profile);
    expect(stack.units).toHaveLength(40);
    expectStackUnits(stack, [
      "iv_immunization_record_reconciliation_iis",
      "iv_immunization_catchup_no_restart_plan",
      "iv_vaccine_contraindication_precaution_screen",
      "iv_live_vaccine_pregnancy_immunosuppression_screen",
      "iv_vaccine_timing_spacing_coadministration_plan",
      "iv_pregnancy_immunization_timing_review",
      "iv_immunocompromised_vaccine_timing_specialist_plan",
      "iv_healthcare_personnel_immunity_vaccine_review",
      "iv_hepatitis_b_postvaccination_serology_hcp_highrisk",
      "iv_travel_accelerated_immunization_timeline",
      "iv_outbreak_postexposure_vaccine_public_health_plan",
      "iv_hib_vaccination_special_situations",
      "iv_cholera_vaccination_travel",
      "iv_tick_borne_encephalitis_vaccination_travel",
      "iv_maternal_rsv_vaccine",
      "iv_yellow_fever_vaccination_travel",
      "iv_mpox_jynneos_vaccination"
    ]);
    expect(stack.evidence_summary).toEqual({ A: 37, B: 3, C: 0, D: 0 });
    expect(stack.cost_per_month_usd).toBe(179);
    expect(stack.review_required).toBe(true);
    expectCategory(stack, "measurement");
    expectCategory(stack, "pharmaceutical");
    expectScheduledIncludes(stack.schedule.daily.vaccination_visit, [
      "iv_vaccine_contraindication_precaution_screen",
      "iv_live_vaccine_pregnancy_immunosuppression_screen",
      "iv_vaccine_timing_spacing_coadministration_plan"
    ]);
    expectScheduledIncludes(stack.schedule.daily.travel_clinic, ["iv_cholera_vaccination_travel", "iv_tick_borne_encephalitis_vaccination_travel"]);
    expect(unitCount(stack, "iv_tdap_td_adult_booster")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_vaccine_contraindication_precaution_screen",
          protocols: [
            "proto_immunization_foundation_schedule_catchup",
            "proto_immunization_healthcare_personnel_occupational",
            "proto_immunization_immunocompromised_asplenia_highrisk",
            "proto_immunization_pregnancy_perinatal_timing"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_live_vaccine_pregnancy_immunosuppression_screen",
          protocols: [
            "proto_immunization_foundation_schedule_catchup",
            "proto_immunization_immunocompromised_asplenia_highrisk",
            "proto_immunization_pregnancy_perinatal_timing",
            "proto_immunization_travel_outbreak_accelerated"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );

    const dropped = applyTest(requiredProtocols(library, "proto_immunization_travel_outbreak_accelerated"));
    expectUnitAbsent(dropped, "iv_cholera_vaccination_travel");

    const kept = applyTest(
      requiredProtocols(library, "proto_immunization_travel_outbreak_accelerated"),
      {
        ...baseProfile,
        age: 42,
        flags: flagSet("clinician_managed international_travel cholera_travel_risk")
      }
    );
    expectUnitPresent(kept, "iv_cholera_vaccination_travel");
    expect(kept.review_required).toBe(true);
  });

  it("composes perioperative optimization, anesthesia safety, SSI prevention, ERAS recovery, and older-adult safeguards", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_perioperative_preop_optimization_prehabilitation",
      "proto_perioperative_medication_anesthesia_cardiac_safety",
      "proto_perioperative_surgical_site_infection_glycemic",
      "proto_perioperative_vte_eras_recovery",
      "proto_perioperative_older_adult_function_delirium"
    );
    const profile = {
      ...baseProfile,
      user_id: "u_test_perioperative",
      goal: "perioperative_resilience",
      goal_pole: "surgical_recovery",
      sex: "female" as const,
      age: 72,
      flags: flagSet("clinician_managed elective_surgery_planned major_surgery_planned surgical_consult surgery_planned elevated_risk_surgery cardiac_risk_factors heart_failure coronary_disease valvular_heart_disease tobacco_user smoking nicotine_user unhealthy_alcohol_use alcohol_user alcohol_withdrawal_risk malnutrition_risk low_protein_intake weight_loss high_blood_loss_surgery anemia iron_deficiency prehabilitation_candidate low_functional_capacity anesthesia_planned medication_review_due anticoagulant_use antiplatelet_use diabetes_medication_use polypharmacy sglt2_inhibitor_use glp1_receptor_agonist_use semaglutide_use tirzepatide_use postoperative_pain_plan_needed osa opioid_risk delirium_risk cognitive_impairment implant_surgery antibiotic_prophylaxis_indicated clean_contaminated_surgery long_operation hypothermia_risk diabetes hyperglycemia_risk insulin_use postoperative_recovery surgical_wound vte_risk orthopedic_surgery cancer_surgery prior_vte eras_pathway frailty high_risk_medications older_adult_surgery")
    };
    const stack = applyTest(protocols, profile);
    expect(stack.units).toHaveLength(20);
    expectStackUnits(stack, [
      "iv_surgery_goal_risk_shared_decision",
      "iv_preop_cardiovascular_risk_functional_capacity_assessment",
      "iv_preop_medication_reconciliation_surgery_plan",
      "iv_perioperative_sglt2_hold_plan",
      "iv_perioperative_glp1_aspiration_risk_plan",
      "iv_preop_smoking_cessation_surgery",
      "iv_preop_alcohol_reduction_surgery",
      "iv_preop_nutrition_malnutrition_protein_plan",
      "iv_preop_anemia_iron_optimization",
      "iv_prehabilitation_multimodal_exercise",
      "iv_surgical_site_infection_bathing_skin_prep",
      "iv_surgical_antibiotic_prophylaxis_timing",
      "iv_perioperative_normothermia",
      "iv_perioperative_glycemic_control",
      "iv_surgical_vte_risk_prophylaxis_plan",
      "iv_eras_early_mobilization",
      "iv_eras_postoperative_nutrition_oral_intake",
      "iv_multimodal_opioid_sparing_analgesia",
      "iv_postoperative_delirium_prevention_bundle",
      "iv_postoperative_wound_monitoring_infection_triage"
    ]);
    expect(stack.evidence_summary).toEqual({ A: 17, B: 3, C: 0, D: 0 });
    expect(stack.cost_per_month_usd).toBe(188);
    expect(stack.review_required).toBe(true);
    expectCategory(stack, "measurement");
    expectCategory(stack, "exercise");
    expectCategory(stack, "nutrition");
    expectCategory(stack, "pharmaceutical");
    expectScheduledIncludes(stack.schedule.daily.preop_visit, [
      "iv_preop_cardiovascular_risk_functional_capacity_assessment",
      "iv_preop_medication_reconciliation_surgery_plan",
      "iv_perioperative_sglt2_hold_plan",
      "iv_perioperative_glp1_aspiration_risk_plan"
    ]);
    expectScheduledIncludes(stack.schedule.daily.operating_room, ["iv_surgical_antibiotic_prophylaxis_timing", "iv_perioperative_normothermia"]);
    expectScheduledExact(stack.schedule.weekly.scheduled_session, [
      "iv_prehabilitation_multimodal_exercise"
    ]);
    expect(unitCount(stack, "iv_surgery_goal_risk_shared_decision")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_surgery_goal_risk_shared_decision",
          protocols: [
            "proto_perioperative_medication_anesthesia_cardiac_safety",
            "proto_perioperative_older_adult_function_delirium",
            "proto_perioperative_preop_optimization_prehabilitation"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_postoperative_wound_monitoring_infection_triage",
          protocols: [
            "proto_perioperative_older_adult_function_delirium",
            "proto_perioperative_surgical_site_infection_glycemic",
            "proto_perioperative_vte_eras_recovery"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );

    const dropped = applyTest(requiredProtocols(library, "proto_perioperative_vte_eras_recovery"));
    expectUnitAbsent(dropped, "iv_surgical_vte_risk_prophylaxis_plan");

    const kept = applyTest(
      requiredProtocols(library, "proto_perioperative_vte_eras_recovery"),
      {
        ...baseProfile,
        flags: flagSet("clinician_managed major_surgery_planned vte_risk")
      }
    );
    expectUnitPresent(kept, "iv_surgical_vte_risk_prophylaxis_plan");
    expect(kept.review_required).toBe(true);
  });

  it("composes gynecologic bleeding, endometriosis, fibroid, vaginitis, and cervical abnormality pathways", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_gynecology_aub_heavy_menstrual_bleeding",
      "proto_gynecology_endometriosis_chronic_pelvic_pain",
      "proto_gynecology_fibroids_structural_uterine_bleeding",
      "proto_gynecology_vaginitis_vulvovaginal_infection",
      "proto_gynecology_cervical_screening_abnormality_followup"
    );
    const profile = {
      ...baseProfile,
      user_id: "u_test_gynecology",
      goal: "gynecologic_health",
      goal_pole: "symptom_control_cancer_prevention",
      sex: "female" as const,
      age: 46,
      flags: flagSet("clinician_managed reproductive_age aub heavy_menstrual_bleeding heavy_menses irregular_bleeding persistent_aub anemia iron_deficiency structural_cause_suspected fibroids fibroid_symptoms bulk_symptoms endometrial_cancer_risk txa_candidate nsaid_candidate dysmenorrhea menstrual_suppression_interest levonorgestrel_iud_interest iud_candidate endometriosis_suspected chronic_pelvic_pain pelvic_pain dyspareunia deep_endometriosis_suspected endometriosis_medical_treatment_failed gnrh_candidate laparoscopy_candidate symptomatic_fibroids_refractory procedure_interest vaginal_discharge vaginal_odor vulvar_itching sexually_active new_partner bv_diagnosed vvc_diagnosed trichomoniasis_diagnosed abnormal_cervical_screening hpv_positive asccp_colposcopy_threshold persistent_hpv_positive cin2plus hpv_vaccine_candidate", { hpv_vaccinated: false })
    };
    const stack = applyTest(protocols, profile);
    expect(stack.units).toHaveLength(25);
    expectStackUnits(stack, [
      "iv_gynecologic_bleeding_pain_history_calendar",
      "iv_pregnancy_exclusion_aub_pelvic_pain",
      "iv_aub_cbc_ferritin_endocrine_coagulopathy_workup",
      "iv_pelvic_ultrasound_structural_gynecology",
      "iv_endometrial_sampling_aub_risk",
      "iv_tranexamic_acid_heavy_menstrual_bleeding",
      "iv_nsaid_dysmenorrhea_heavy_menses",
      "iv_hormonal_menstrual_suppression_endometriosis_aub",
      "iv_endometriosis_diagnosis_referral_imaging",
      "iv_gnrh_agonist_antagonist_endometriosis_fibroid_review",
      "iv_endometriosis_laparoscopy_excision_ablation",
      "iv_fibroid_symptom_mapping_classification",
      "iv_fibroid_procedure_options_review",
      "iv_vaginitis_point_of_care_naat_diagnostic_pathway",
      "iv_bacterial_vaginosis_antimicrobial_treatment",
      "iv_vulvovaginal_candidiasis_azole_treatment",
      "iv_trichomoniasis_treatment_partner_retest",
      "iv_asccp_risk_based_cervical_abnormality_management",
      "iv_colposcopy_biopsy_endocervical_sampling",
      "iv_cin2plus_excisional_treatment_surveillance",
      "iv_levonorgestrel_iud_larc",
      "iv_sti_panel_anatomic_site_screening",
      "iv_cervical_cytology_screening",
      "iv_high_risk_hpv_screening",
      "iv_hpv_vaccination_cancer_prevention"
    ]);
    expect(stack.evidence_summary).toEqual({ A: 25, B: 0, C: 0, D: 0 });
    expect(stack.cost_per_month_usd).toBe(1626);
    expect(stack.review_required).toBe(true);
    expectCategory(stack, "measurement");
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expectScheduledIncludes(stack.schedule.daily.gynecology_visit, [
      "iv_endometrial_sampling_aub_risk",
      "iv_endometriosis_diagnosis_referral_imaging",
      "iv_fibroid_symptom_mapping_classification",
      "iv_colposcopy_biopsy_endocervical_sampling",
      "iv_cin2plus_excisional_treatment_surveillance"
    ]);
    expectScheduledIncludes(stack.schedule.daily.with_menses, ["iv_nsaid_dysmenorrhea_heavy_menses", "iv_tranexamic_acid_heavy_menstrual_bleeding"]);
    expect(unitCount(stack, "iv_gynecologic_bleeding_pain_history_calendar")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_gynecologic_bleeding_pain_history_calendar",
          protocols: [
            "proto_gynecology_aub_heavy_menstrual_bleeding",
            "proto_gynecology_endometriosis_chronic_pelvic_pain",
            "proto_gynecology_fibroids_structural_uterine_bleeding"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_hormonal_menstrual_suppression_endometriosis_aub",
          protocols: [
            "proto_gynecology_aub_heavy_menstrual_bleeding",
            "proto_gynecology_endometriosis_chronic_pelvic_pain",
            "proto_gynecology_fibroids_structural_uterine_bleeding"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );

    const dropped = applyTest(requiredProtocols(library, "proto_gynecology_vaginitis_vulvovaginal_infection"));
    expectUnitAbsent(dropped, "iv_bacterial_vaginosis_antimicrobial_treatment");

    const kept = applyTest(
      requiredProtocols(library, "proto_gynecology_vaginitis_vulvovaginal_infection"),
      {
        ...baseProfile,
        sex: "female" as const,
        flags: flagSet("clinician_managed vaginal_discharge bacterial_vaginosis_diagnosed")
      }
    );
    expectUnitPresent(kept, "iv_bacterial_vaginosis_antimicrobial_treatment");
    expect(kept.review_required).toBe(true);
  });

  it("composes hepatology and pancreatobiliary surveillance, treatment linkage, and source-control pathways", async () => {
    const protocols = requiredProtocols(
      library,
      "proto_hepatology_cirrhosis_complication_surveillance",
      "proto_hepatology_viral_hepatitis_treatment_linkage",
      "proto_hepatology_cholestatic_liver_disease_pbc_psc",
      "proto_pancreatobiliary_gallstone_biliary_colic",
      "proto_pancreatobiliary_acute_recurrent_pancreatitis"
    );
    const profile = {
      ...baseProfile,
      user_id: "u_test_hepatology_pancreatobiliary",
      goal: "hepatology_pancreatobiliary",
      goal_pole: "decompensation_cancer_recurrence_prevention",
      sex: "female" as const,
      age: 58,
      flags: flagSet("clinician_managed cirrhosis advanced_liver_disease decompensated_cirrhosis portal_hypertension varices clinically_significant_portal_hypertension nsbb_candidate high_risk_varices ascites new_ascites worsening_ascites hospitalized_cirrhosis tense_ascites sbp_suspected sbp_history high_risk_ascites diuretic_candidate hepatic_encephalopathy recurrent_he overt_he sarcopenia_risk malnutrition_risk alcohol_user alcohol_related_liver_disease meld_high transplant_referral_needed hcv_antibody_positive hcv_rna_positive chronic_hepatitis_c hcv_treatment_candidate hbsag_positive chronic_hepatitis_b hbv_dna_positive hbv_treatment_indicated hbv_cirrhosis hbv_nonimmune hbv_vaccine_due cholestatic_liver_tests pbc_suspected pbc primary_biliary_cholangitis cholestatic_pruritus pruritus_pbc_psc psc primary_sclerosing_cholangitis dominant_stricture_suspected ibd refractory_pruritus recurrent_cholangitis biliary_colic gallstones symptomatic_gallstones recurrent_biliary_colic cholecystectomy_candidate gallstone_pancreatitis cholangitis common_bile_duct_stone biliary_obstruction pancreatitis_suspected acute_pancreatitis pancreatitis_hospitalized severe_hypertriglyceridemia triglyceride_pancreatitis recurrent_pancreatitis chronic_pancreatitis alcohol_related_pancreatitis smoking nrt_ok exocrine_pancreatic_insufficiency steatorrhea weight_loss", { hcv_screened: false, hbv_screened: false })
    };
    const stack = applyTest(protocols, profile);
    expect(stack.units).toHaveLength(34);
    expectStackUnits(stack, [
      "iv_cirrhosis_compensation_meld_child_pugh_assessment",
      "iv_cirrhosis_hcc_ultrasound_afp_surveillance",
      "iv_portal_hypertension_variceal_screening_nsbb_route",
      "iv_nonselective_beta_blocker_portal_hypertension",
      "iv_endoscopic_variceal_ligation",
      "iv_ascites_daily_weight_sodium_plan",
      "iv_diagnostic_therapeutic_paracentesis_ascites",
      "iv_ascites_diuretic_spironolactone_furosemide",
      "iv_sbp_antibiotic_albumin_prophylaxis_review",
      "iv_hepatic_encephalopathy_precipitant_review",
      "iv_lactulose_rifaximin_hepatic_encephalopathy",
      "iv_cirrhosis_nutrition_late_evening_snack_sarcopenia",
      "iv_liver_transplant_referral_meld_decompensation",
      "iv_hepatitis_b_screening",
      "iv_hepatitis_c_screening",
      "iv_hcv_rna_genotype_fibrosis_linkage",
      "iv_direct_acting_antiviral_hcv_treatment",
      "iv_hbv_dna_alt_hbeag_fibrosis_monitoring",
      "iv_hbv_tenofovir_entecavir_antiviral_review",
      "iv_hepatitis_b_vaccination_liver_cancer_prevention",
      "iv_pbc_cholestasis_ama_workup",
      "iv_ursodeoxycholic_acid_pbc",
      "iv_cholestatic_pruritus_cholestyramine_stepwise",
      "iv_psc_mrcp_colon_cancer_cholangiocarcinoma_surveillance",
      "iv_biliary_colic_ruq_ultrasound_surgical_referral",
      "iv_laparoscopic_cholecystectomy_symptomatic_gallstones",
      "iv_acute_pancreatitis_lipase_severity_etiology_triage",
      "iv_acute_pancreatitis_early_feeding_fluid_support",
      "iv_gallstone_pancreatitis_ercp_cholecystectomy_pathway",
      "iv_hypertriglyceridemia_secondary_cause_review",
      "iv_pancreatitis_alcohol_tobacco_cessation_plan",
      "iv_nicotine_replacement_combination",
      "iv_pancreatic_enzyme_replacement_epi"
    ]);
    expect(stack.evidence_summary).toEqual({ A: 29, B: 5, C: 0, D: 0 });
    expect(stack.cost_per_month_usd).toBe(3156);
    expect(stack.review_required).toBe(true);
    expectCategory(stack, "measurement");
    expectCategory(stack, "advanced_therapy");
    expectCategory(stack, "pharmaceutical");
    expectCategory(stack, "nutrition");
    expectScheduledIncludes(stack.schedule.daily.hepatology_visit, [
      "iv_cirrhosis_compensation_meld_child_pugh_assessment",
      "iv_portal_hypertension_variceal_screening_nsbb_route",
      "iv_psc_mrcp_colon_cancer_cholangiocarcinoma_surveillance"
    ]);
    expectScheduledIncludes(stack.schedule.daily.urgent_visit, [
      "iv_acute_pancreatitis_lipase_severity_etiology_triage",
      "iv_diagnostic_therapeutic_paracentesis_ascites",
      "iv_sbp_antibiotic_albumin_prophylaxis_review"
    ]);
    expect(unitCount(stack, "iv_cirrhosis_hcc_ultrasound_afp_surveillance")).toBe(1);
    expect(stack.validation.collisions).toEqual(
      expect.arrayContaining([
        {
          unit_id: "iv_cirrhosis_hcc_ultrasound_afp_surveillance",
          protocols: [
            "proto_hepatology_cholestatic_liver_disease_pbc_psc",
            "proto_hepatology_cirrhosis_complication_surveillance",
            "proto_hepatology_viral_hepatitis_treatment_linkage"
          ],
          resolution: "deduped canonical unit by id"
        },
        {
          unit_id: "iv_gallstone_pancreatitis_ercp_cholecystectomy_pathway",
          protocols: [
            "proto_pancreatobiliary_acute_recurrent_pancreatitis",
            "proto_pancreatobiliary_gallstone_biliary_colic"
          ],
          resolution: "deduped canonical unit by id"
        }
      ])
    );

    const hcvDropped = applyTest(requiredProtocols(library, "proto_hepatology_viral_hepatitis_treatment_linkage"));
    expectUnitAbsent(hcvDropped, "iv_direct_acting_antiviral_hcv_treatment");

    const hcvKept = applyTest(
      requiredProtocols(library, "proto_hepatology_viral_hepatitis_treatment_linkage"),
      {
        ...baseProfile,
        age: 44,
        flags: flagSet("clinician_managed hcv_rna_positive chronic_hepatitis_c hcv_treatment_candidate")
      }
    );
    expectUnitPresent(hcvKept, "iv_direct_acting_antiviral_hcv_treatment");
    expect(hcvKept.review_required).toBe(true);
  });

  it("composes a unit referenced by two protocols once and records the collision", async () => {
    const exercise = requiredProtocol(library, "proto_blueprint_exercise");
    const nutrition = requiredProtocol(library, "proto_blueprint_nutrition");
    const stack = applyTest([exercise, nutrition]);

    expect(unitCount(stack, "iv_sauna")).toBe(1);
    expect(stack.validation.collisions).toContainEqual({
      unit_id: "iv_sauna",
      protocols: ["proto_blueprint_exercise", "proto_blueprint_nutrition"],
      resolution: "deduped canonical unit by id"
    });
  });

  it("selects protocols by id in requested order and reports missing ids", async () => {

    expectProtocolIdsExact(
      selectProtocols(library, {
        ids: ["proto_blueprint_nutrition", "proto_blueprint_sleep"]
      }),
      ["proto_blueprint_nutrition", "proto_blueprint_sleep"]
    );

    expect(() => selectProtocols(library, { ids: ["proto_missing"] })).toThrow('Missing protocol "proto_missing"');
  });

  it("selects applicable protocols by profile, category, and id prefix", async () => {

    const inactive = selectProtocols(library, {
      idPrefixes: ["proto_clinical_"],
      categories: ["pharmaceutical"],
      profile: baseProfile
    });
    const active = selectProtocols(library, {
      idPrefixes: ["proto_clinical_"],
      categories: ["pharmaceutical"],
      profile: {
        ...baseProfile,
        flags: flagSet("clinician_managed")
      }
    });

    expectProtocolAbsent(inactive, "proto_clinical_blood_pressure_management");
    expectProtocolPresent(active, "proto_clinical_blood_pressure_management");
    expect(active.every((protocol) => protocol.id.startsWith("proto_clinical_"))).toBe(true);
    expect(active.every((protocol) => protocol.category === "pharmaceutical")).toBe(true);
  });

  it("composes a stack through the high-level convenience API", async () => {
    const stack = await composeStack(baseProfile, {
      library,
      selection: {
        ids: ["proto_blueprint_sleep", "proto_blueprint_exercise", "proto_blueprint_nutrition"]
      }
    });

    expect(stack.units).toHaveLength(15);
    expect(stack.validation.collisions).toContainEqual({
      unit_id: "iv_sauna",
      protocols: ["proto_blueprint_exercise", "proto_blueprint_nutrition"],
      resolution: "deduped canonical unit by id"
    });
  });

  it("accepts minimal profile input and applies schema defaults", async () => {
    const stack = await composeStack(
      {
        user_id: "u_minimal",
        goal: "general_longevity"
      },
      {
        library,
        selection: {
          ids: ["proto_blueprint_sleep", "proto_blueprint_exercise", "proto_blueprint_nutrition"]
        }
      }
    );

    expect(stack.user_id).toBe("u_minimal");
    expect(stack.units).toHaveLength(15);
    expect(stack.validation.blocked).toEqual([]);
  });

  it("rejects ambiguous composeStack library options", async () => {

    await expect(composeStack(baseProfile, { library, libraryRoot: process.cwd() })).rejects.toThrow(
      "composeStack accepts either options.library or options.libraryRoot, not both"
    );
  });

  it("creates a reusable protocol engine over one loaded library", async () => {
    const engine = await createProtocolEngine({ library });
    const protocols = engine.selectProtocols(baseProfile, {
      ids: ["proto_blueprint_sleep", "proto_blueprint_exercise", "proto_blueprint_nutrition"]
    });
    const stack = await engine.composeStack(baseProfile, {
      protocols
    });

    expect(engine.library).toBe(library);
    expectProtocolIdsExact(protocols, [
      "proto_blueprint_sleep",
      "proto_blueprint_exercise",
      "proto_blueprint_nutrition"
    ]);
    expect(stack.units).toHaveLength(15);
    expect(stack.validation.collisions).toHaveLength(1);
  });

  it("rejects ambiguous createProtocolEngine library options", async () => {

    await expect(createProtocolEngine({ library, libraryRoot: process.cwd() })).rejects.toThrow(
      "createProtocolEngine accepts either options.library or options.libraryRoot, not both"
    );
  });

  it("reports duplicate medication keys, high-risk stacking, and low-risk redundancies", () => {
    const validation = validateSafety([
      testUnit({
        id: "iv_test_aspirin",
        interaction_keys: {
          rxnorm: "1191",
          interaction_class: ["antiplatelet", "bleeding_risk"]
        }
      }),
      testUnit({
        id: "iv_test_aspirin_duplicate",
        interaction_keys: {
          rxnorm: "1191",
          interaction_class: ["bleeding_risk"]
        }
      }),
      testUnit({
        id: "iv_test_zone2",
        interaction_keys: {
          interaction_class: ["exercise_aerobic"]
        }
      }),
      testUnit({
        id: "iv_test_intervals",
        interaction_keys: {
          interaction_class: ["exercise_aerobic"]
        }
      })
    ]);

    expect(validation.interactions).toContainEqual({
      severity: "major",
      pair: ["iv_test_aspirin", "iv_test_aspirin_duplicate"],
      note: "shared bleeding_risk interaction class; clinician review recommended"
    });
    expect(validation.interactions).toContainEqual({
      severity: "moderate",
      pair: ["iv_test_aspirin", "iv_test_aspirin_duplicate"],
      note: "duplicate RxNorm key 1191; review duplicate medication intent"
    });
    expect(validation.redundancies).toContainEqual({
      mode: "exercise_aerobic",
      units: ["iv_test_intervals", "iv_test_zone2"]
    });
  });

  it("reports profile-matched contraindications as blocked validation items", () => {
    const validation = validateSafety(
      [
        testUnit({
          id: "iv_test_pregnancy_contraindicated",
          contraindications: ["pregnancy"]
        }),
        testUnit({
          id: "iv_test_warfarin_caution",
          contraindications: ["warfarin_use_without_guidance"]
        })
      ],
      {
        ...baseProfile,
        pregnant: true,
        medications: ["warfarin"]
      }
    );

    expect(validation.blocked).toEqual([
      {
        unit: "iv_test_pregnancy_contraindicated",
        reason: 'matched contraindication "pregnancy"'
      },
      {
        unit: "iv_test_warfarin_caution",
        reason: 'matched contraindication "warfarin_use_without_guidance"'
      }
    ]);
  });
});

function requiredProtocol(library: InterventionLibrary, id: string): Protocol {
  const protocol = library.getProtocol(id);
  if (!protocol) {
    throw new Error(`Missing test protocol ${id}`);
  }
  return protocol;
}

function requiredProtocols(library: InterventionLibrary, ...ids: string[]): Protocol[] {
  return ids.map((id) => requiredProtocol(library, id));
}

function protocolsByPrefix(library: InterventionLibrary, ...prefixes: string[]): Protocol[] {
  return library
    .allProtocols()
    .filter((protocol) => prefixes.some((prefix) => protocol.id.startsWith(prefix)));
}

async function createInvalidLibraryFixture(): Promise<string> {
  const root = path.join(tmpdir(), `protocol-engine-${randomUUID()}`);
  const unitsDir = path.join(root, "data", "units");
  const protocolsDir = path.join(root, "data", "protocols");
  await mkdir(unitsDir, { recursive: true });
  await mkdir(protocolsDir, { recursive: true });
  await writeFile(
    path.join(unitsDir, "invalid.json"),
    JSON.stringify({
      id: "iv_invalid",
      canonical_name: "Invalid unit",
      aliases: [],
      category: "sleep",
      codes: {},
      dose: { value: 1, unit: "routine", route: "behavioral", scalable: false },
      timing: { frequency: "1x/day", time_of_day: "night" },
      targets: [],
      mechanisms: ["test"],
      hallmarks: [],
      evidence: {
        grade: "B",
        best_study: "Test",
        human_rct: false,
        citations: []
      },
      interaction_keys: {},
      contraindications: [],
      cost_per_month_usd: 0,
      burden_score: 1
    })
  );
  await writeFile(
    path.join(protocolsDir, "valid.json"),
    JSON.stringify({
      id: "proto_valid",
      name: "Valid",
      source: "test",
      category: "sleep",
      intention: {
        primary_goal: "test",
        targets: []
      },
      actions: [{ unit: "iv_invalid", params: {} }],
      applies_when: "always",
      conflicts_with: []
    })
  );
  return root;
}

async function createGzipLibraryFixture(): Promise<string> {
  const root = path.join(tmpdir(), `protocol-engine-${randomUUID()}`);
  const unitsDir = path.join(root, "data", "units");
  const protocolsDir = path.join(root, "data", "protocols");
  await mkdir(unitsDir, { recursive: true });
  await mkdir(protocolsDir, { recursive: true });

  await writeFile(
    path.join(unitsDir, "catalog.json.gz"),
    gzipSync(
      JSON.stringify([
        testUnit({
          id: "iv_gzip_fixture",
          canonical_name: "Gzip fixture"
        })
      ])
    )
  );
  await writeFile(
    path.join(protocolsDir, "catalog.json.gz"),
    gzipSync(
      JSON.stringify([
        {
          id: "proto_gzip_fixture",
          name: "Gzip fixture protocol",
          source: "test",
          category: "supplement",
          intention: {
            primary_goal: "test",
            targets: []
          },
          actions: [{ unit: "iv_gzip_fixture", params: {} }],
          applies_when: "always",
          conflicts_with: []
        }
      ])
    )
  );

  return root;
}

async function createBrotliLibraryFixture(): Promise<string> {
  const root = path.join(tmpdir(), `protocol-engine-${randomUUID()}`);
  const unitsDir = path.join(root, "data", "units");
  const protocolsDir = path.join(root, "data", "protocols");
  await mkdir(unitsDir, { recursive: true });
  await mkdir(protocolsDir, { recursive: true });

  await writeFile(
    path.join(unitsDir, "catalog.json.br"),
    brotliCompressSync(
      JSON.stringify([
        testUnit({
          id: "iv_brotli_fixture",
          canonical_name: "Brotli fixture"
        })
      ])
    )
  );
  await writeFile(
    path.join(protocolsDir, "catalog.json.br"),
    brotliCompressSync(
      JSON.stringify([
        {
          id: "proto_brotli_fixture",
          name: "Brotli fixture protocol",
          source: "test",
          category: "supplement",
          intention: {
            primary_goal: "test",
            targets: []
          },
          actions: [{ unit: "iv_brotli_fixture", params: {} }],
          applies_when: "always",
          conflicts_with: []
        }
      ])
    )
  );

  return root;
}

function testUnit(overrides: Partial<InterventionUnit> & Pick<InterventionUnit, "id">): InterventionUnit {
  return InterventionUnitSchema.parse({
    id: overrides.id,
    canonical_name: overrides.canonical_name ?? overrides.id,
    aliases: overrides.aliases ?? [],
    category: overrides.category ?? "supplement",
    codes: overrides.codes ?? { local: overrides.id },
    dose: overrides.dose ?? { value: 1, unit: "unit", route: "test", scalable: false },
    timing: overrides.timing ?? { frequency: "1x/day", time_of_day: "morning" },
    targets: overrides.targets ?? [],
    mechanisms: overrides.mechanisms ?? ["test"],
    hallmarks: overrides.hallmarks ?? [],
    evidence: overrides.evidence ?? {
      grade: "B",
      best_study: "Test fixture",
      human_rct: false,
      citations: ["test"]
    },
    interaction_keys: overrides.interaction_keys ?? {},
    contraindications: overrides.contraindications ?? [],
    cost_per_month_usd: overrides.cost_per_month_usd ?? 0,
    burden_score: overrides.burden_score ?? 1
  });
}
