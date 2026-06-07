import { z } from "zod";

export type EvidenceGrade = "A" | "B" | "C" | "D";
export const EvidenceGradeSchema: z.ZodType<EvidenceGrade> = z.enum(["A", "B", "C", "D"]);

export type Category =
  | "sleep"
  | "nutrition"
  | "exercise"
  | "supplement"
  | "pharmaceutical"
  | "skin"
  | "oral"
  | "hair"
  | "hydration"
  | "light"
  | "temperature"
  | "breath"
  | "stress"
  | "measurement"
  | "advanced_therapy";

export const CategorySchema: z.ZodType<Category> = z.enum([
  "sleep",
  "nutrition",
  "exercise",
  "supplement",
  "pharmaceutical",
  "skin",
  "oral",
  "hair",
  "hydration",
  "light",
  "temperature",
  "breath",
  "stress",
  "measurement",
  "advanced_therapy"
]);

export type Direction = "up" | "down" | "neutral";
export const DirectionSchema: z.ZodType<Direction> = z.enum(["up", "down", "neutral"]);

const NonEmptyString = z.string().trim().min(1);
const OptionalString = NonEmptyString.optional();
const StringArray = z.array(NonEmptyString);
const object = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).strict();

export type Codes = {
  rxnorm?: string;
  unii?: string;
  snomed?: string;
  loinc?: string;
  fdc?: string;
  cpa?: string;
  idisk?: string;
  local?: string;
};

export const CodesSchema: z.ZodType<Codes> = object({
  rxnorm: OptionalString,
  unii: OptionalString,
  snomed: OptionalString,
  loinc: OptionalString,
  fdc: OptionalString,
  cpa: OptionalString,
  idisk: OptionalString,
  local: OptionalString
})
  .superRefine((codes, ctx) => {
    if (!Object.values(codes).some(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "InterventionUnit must include at least one standard code"
      });
    }
  });

export type DoseRange = {
  min: number;
  max: number;
  step: number;
};

export const DoseRangeSchema: z.ZodType<DoseRange> = object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive()
})
  .refine((range) => range.max >= range.min, {
    message: "Dose range max must be greater than or equal to min",
    path: ["max"]
  });

export type Dose = {
  value: number;
  unit: string;
  route: string;
  scalable: boolean;
  range?: DoseRange;
};

export const DoseSchema: z.ZodType<Dose> = object({
  value: z.number().nonnegative(),
  unit: NonEmptyString,
  route: NonEmptyString,
  scalable: z.boolean().optional().default(false) as unknown as z.ZodType<boolean>,
  range: DoseRangeSchema.optional()
});

export type Timing = {
  frequency: string;
  time_of_day: string;
  with_food?: boolean;
  days_of_week?: string[];
  duration_min?: number;
  relative_to?: string;
  cycle?: {
    on_weeks: number;
    off_weeks: number;
  };
};

export const TimingSchema: z.ZodType<Timing> = object({
  frequency: NonEmptyString,
  time_of_day: NonEmptyString,
  with_food: z.boolean().optional(),
  days_of_week: StringArray.optional(),
  duration_min: z.number().positive().optional(),
  relative_to: OptionalString,
  cycle: object({
    on_weeks: z.number().int().positive(),
    off_weeks: z.number().int().nonnegative()
  }).optional()
});

export type Target = {
  biomarker: string;
  direction: Direction;
  loinc?: string | null;
};

export const TargetSchema: z.ZodType<Target> = object({
  biomarker: NonEmptyString,
  direction: DirectionSchema,
  loinc: NonEmptyString.nullable().optional().default(null)
});

export type Evidence = {
  grade: EvidenceGrade;
  best_study: string;
  human_rct: boolean;
  citations: string[];
};

export const EvidenceSchema: z.ZodType<Evidence> = object({
  grade: EvidenceGradeSchema,
  best_study: NonEmptyString,
  human_rct: z.boolean().optional().default(false) as unknown as z.ZodType<boolean>,
  citations: StringArray
});

export type InteractionKeys = {
  rxnorm?: string;
  interaction_class?: string[];
};

export const InteractionKeysSchema: z.ZodType<InteractionKeys> = object({
  rxnorm: OptionalString,
  interaction_class: StringArray.optional()
});

export type InterventionUnit = {
  id: string;
  canonical_name: string;
  aliases: string[];
  category: Category;
  codes: Codes;
  dose: Dose;
  timing: Timing;
  targets: Target[];
  mechanisms: string[];
  hallmarks: string[];
  evidence: Evidence;
  interaction_keys: InteractionKeys;
  contraindications: string[];
  cost_per_month_usd: number;
  burden_score: number;
};

export const InterventionUnitSchema: z.ZodType<InterventionUnit> = object({
  id: NonEmptyString,
  canonical_name: NonEmptyString,
  aliases: StringArray,
  category: CategorySchema,
  codes: CodesSchema,
  dose: DoseSchema,
  timing: TimingSchema,
  targets: z.array(TargetSchema),
  mechanisms: StringArray.min(1),
  hallmarks: StringArray,
  evidence: EvidenceSchema,
  interaction_keys: InteractionKeysSchema,
  contraindications: StringArray,
  cost_per_month_usd: z.number().nonnegative(),
  burden_score: z.number().int().min(1).max(5)
});

export type Intention = {
  primary_goal: string;
  targets: Target[];
};

export const IntentionSchema: z.ZodType<Intention> = object({
  primary_goal: NonEmptyString,
  targets: z.array(TargetSchema)
});

export type JsonLiteral = string | number | boolean | null;
export type JsonValue = JsonLiteral | { [key: string]: JsonValue } | JsonValue[];

const JsonLiteralSchema: z.ZodType<JsonLiteral> = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonLiteralSchema, z.array(JsonValueSchema), z.record(JsonValueSchema)])
);

export type ProtocolAction = {
  unit: string;
  params: Record<string, JsonValue>;
  condition?: string;
};

export type ProtocolActionInput = Omit<ProtocolAction, "params"> & {
  params?: Record<string, JsonValue>;
};

export const ProtocolActionSchema: z.ZodType<ProtocolAction, z.ZodTypeDef, ProtocolActionInput> = object({
  unit: NonEmptyString,
  params: z.record(JsonValueSchema).default({}),
  condition: OptionalString
});

export type Protocol = {
  id: string;
  name: string;
  source: string;
  category: Category;
  intention: Intention;
  actions: ProtocolAction[];
  applies_when: string;
  conflicts_with: string[];
};

export type ProtocolInput = Omit<Protocol, "actions"> & {
  actions: ProtocolActionInput[];
};

export const ProtocolSchema: z.ZodType<Protocol, z.ZodTypeDef, ProtocolInput> = object({
  id: NonEmptyString,
  name: NonEmptyString,
  source: NonEmptyString,
  category: CategorySchema,
  intention: IntentionSchema,
  actions: z.array(ProtocolActionSchema).min(1),
  applies_when: NonEmptyString,
  conflicts_with: StringArray
});

export type UserProfileInput = {
  user_id: string;
  goal: string;
  goal_pole?: string;
  sex?: "female" | "male" | "intersex" | "unknown";
  pregnant?: boolean;
  age?: number;
  conditions?: string[];
  medications?: string[];
  constraints?: string[];
  flags?: Record<string, boolean>;
  biomarkers?: Record<string, number>;
};

export type UserProfile = Required<Pick<UserProfileInput, "user_id" | "goal">> &
  Pick<UserProfileInput, "goal_pole" | "sex" | "pregnant" | "age"> & {
    conditions: string[];
    medications: string[];
    constraints: string[];
    flags: Record<string, boolean>;
    biomarkers: Record<string, number>;
  };

export const UserProfileSchema: z.ZodType<UserProfile, z.ZodTypeDef, UserProfileInput> = object({
  user_id: NonEmptyString,
  goal: NonEmptyString,
  goal_pole: OptionalString,
  sex: z.enum(["female", "male", "intersex", "unknown"]).optional(),
  pregnant: z.boolean().optional(),
  age: z.number().int().positive().optional(),
  conditions: StringArray.default([]),
  medications: StringArray.default([]),
  constraints: StringArray.default([]),
  flags: z.record(z.boolean()).default({}),
  biomarkers: z.record(z.number()).default({})
});

export type Collision = {
  unit_id: string;
  protocols: string[];
  resolution: string;
};

export const CollisionSchema: z.ZodType<Collision> = object({
  unit_id: NonEmptyString,
  protocols: StringArray.min(2),
  resolution: NonEmptyString
});

export type Validation = {
  interactions: Array<{
    severity: "minor" | "moderate" | "major";
    pair: [string, string];
    note: string;
  }>;
  redundancies: Array<{
    mode: string;
    units: string[];
  }>;
  intention_conflicts: string[];
  blocked: Array<{
    unit: string;
    reason: string;
  }>;
  collisions: Collision[];
};

export const ValidationSchema: z.ZodType<Validation> = object({
  interactions: z.array(
    object({
      severity: z.enum(["minor", "moderate", "major"]),
      pair: z.tuple([NonEmptyString, NonEmptyString]),
      note: NonEmptyString
    })
  ),
  redundancies: z.array(
    object({
      mode: NonEmptyString,
      units: StringArray.min(2)
    })
  ),
  intention_conflicts: StringArray,
  blocked: z.array(
    object({
      unit: NonEmptyString,
      reason: NonEmptyString
    })
  ),
  collisions: z.array(CollisionSchema)
});

export type ScheduledUnit = {
  unit_id: string;
  name: string;
  category: Category;
  dose: Dose;
  timing: Timing;
  protocol_ids: string[];
};

export const ScheduledUnitSchema: z.ZodType<ScheduledUnit> = object({
  unit_id: NonEmptyString,
  name: NonEmptyString,
  category: CategorySchema,
  dose: DoseSchema,
  timing: TimingSchema,
  protocol_ids: StringArray.min(1)
});

export type Schedule = {
  daily: Record<string, ScheduledUnit[]>;
  weekly: Record<string, ScheduledUnit[]>;
};

export const ScheduleSchema: z.ZodType<Schedule> = object({
  daily: z.record(z.array(ScheduledUnitSchema)),
  weekly: z.record(z.array(ScheduledUnitSchema))
});

export type EvidenceSummary = Record<EvidenceGrade, number>;

export const EvidenceSummarySchema: z.ZodType<EvidenceSummary> = object({
  A: z.number().int().nonnegative(),
  B: z.number().int().nonnegative(),
  C: z.number().int().nonnegative(),
  D: z.number().int().nonnegative()
});

export type PersonalizedStack = {
  user_id: string;
  generated_at: string;
  goal_pole?: string;
  units: InterventionUnit[];
  schedule: Schedule;
  validation: Validation;
  evidence_summary: EvidenceSummary;
  cost_per_month_usd: number;
  review_required: boolean;
};

export const PersonalizedStackSchema: z.ZodType<PersonalizedStack> = object({
  user_id: NonEmptyString,
  generated_at: z.string().datetime(),
  goal_pole: OptionalString,
  units: z.array(InterventionUnitSchema),
  schedule: ScheduleSchema,
  validation: ValidationSchema,
  evidence_summary: EvidenceSummarySchema,
  cost_per_month_usd: z.number().nonnegative(),
  review_required: z.boolean()
});
