import { Stimuli } from "./stimuli";

export type MegQuota = {
  ratio: number;
  count: number;
};

export function computeMegQuota(stimuli: Stimuli, agentCount: number): MegQuota {
  const base = 0.25;
  const ratio = clamp(
    base + 0.5 * stimuli.megPressure - 0.6 * stimuli.maxDeficitNormalized,
    0,
    0.8,
  );
  const count = Math.max(0, Math.floor(ratio * agentCount));
  return { ratio, count };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
