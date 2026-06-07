# Agent Integration

Health Protocol Engine is a good tool backend for agent systems such as OpenClaw, Hermes, or custom LLM assistants.

The key rule: the agent explains and orchestrates; the engine composes.

## Recommended Split

Agent responsibilities:

```text
Ask clarifying questions
Translate user language into profile flags
Suggest protocol families
Call the engine
Explain the result
Create reminders or tasks
Track follow-up measurements
```

Engine responsibilities:

```text
Validate data
Resolve protocol conditions
Dedupe canonical units
Build schedules
Summarize evidence
Flag review_required
Record collisions
```

## Tool Surface

Useful agent tools:

```ts
get_library_stats()
lookup_units_by_target(target: string)
lookup_units_by_mechanism(mechanism: string)
lookup_protocol(id: string)
generate_stack(profile: UserProfile, protocol_ids: string[])
explain_unit(unit_id: string)
```

## Example Conversation Flow

```text
User:
  I want to lower my resting heart rate.

Agent:
  What is your current resting HR, age, sleep quality, exercise level,
  and are you comfortable with heat therapy?

User:
  78 bpm, 42, sleep is rough, I exercise twice a week, sauna is ok.

Agent:
  Builds profile flags:
    hrv_focus
    cardiovascular_focus
    insomnia
    heat_therapy_ok

Agent calls:
  generate_stack(profile, [
    "proto_blueprint_sleep",
    "proto_blueprint_exercise",
    "proto_blueprint_nutrition",
    "proto_breath_autonomic_biofeedback"
  ])

Agent explains:
  The engine selected zone 2 cardio, wake-time regularity,
  early meal timing, sauna, and HRV breathing. No medications were selected.
```

## Guardrails

Agents should not:

```text
Invent units that are not in the library
Invent evidence grades
Hide review_required
Turn pharmaceutical units into direct user instructions
Use the engine output as diagnosis
```

Agents should:

```text
Show evidence grades
Show why a unit appeared
Respect collisions as useful explanation
Separate self-directed habits from clinician-review actions
Log generated stack versions
```

## OpenClaw/Hermes Integration Pattern

Treat Health Protocol Engine as a local deterministic skill/tool:

```text
Hermes/OpenClaw planner
  -> health profile extraction
  -> protocol id selection
  -> Health Protocol Engine tool call
  -> task/reminder/action generation
```

The tool response should include enough metadata for the agent to explain itself:

```text
unit id
canonical name
category
timing
dose
evidence grade
targets
protocol ids
review_required
```

