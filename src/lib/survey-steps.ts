// Shared helper for building discrete duration options for survey sliders.
//
// New rules (based on your examples):
//  - 30  → 5,10,15,20,25,30,35,40,45  (step 5, +3 steps beyond)
//  - 60  → 10,20,30,40,50,60,70,80,90 (step 10, +3 steps beyond)
//  - 5   → 1,2,3,4,5,6,7,8            (step 1, +3 steps beyond)
//
// Generalisation:
//   minStep =
//     d <= 10  →  1
//     d <= 45  →  5
//     else     → 10
//   values = minStep, 2*minStep, ... up to (d + 3*minStep)

export function getDurationOptions(scheduledMinutes: number): number[] {
  const d = Math.max(1, Math.round(scheduledMinutes || 0));

  let step: number;
  if (d <= 10) {
    step = 1;
  } else if (d <= 45) {
    step = 5;
  } else {
    step = 10;
  }

  const max = d + 3 * step;
  const values: number[] = [];

  for (let v = step; v <= max; v += step) {
    values.push(v);
  }

  return values;
}

