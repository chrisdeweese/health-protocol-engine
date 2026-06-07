# Examples

Runnable examples live in `examples/`.

## Lower Resting Heart Rate

```bash
npm run example:rhr
```

Shows how to use goal/profile flags to compose a stack relevant to:

```text
resting heart rate
VO2max
sleep regularity
HRV
stress regulation
heat therapy
```

## Generic Stack

```bash
npm run example:stack
```

Shows a minimal baseline profile using Blueprint sleep, exercise, and nutrition protocols.

## Broad Smoke Scenarios

```bash
npm run smoke:use-cases
```

This emits larger JSON covering many protocol families. It is useful for regression testing and understanding how complex stacks compose across domains.

