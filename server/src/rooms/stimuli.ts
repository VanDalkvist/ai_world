import { WorldState, ResourceKind } from "./schema/WorldState";

export type Stimuli = {
  deficits: Record<ResourceKind, number>;
  deficitNormalized: Record<ResourceKind, number>;
  maxDeficitNormalized: number;
  upkeepDemand: { energy: number; data: number };
  megPressure: number;
  targetStock: number;
};

const RESOURCE_KINDS: ResourceKind[] = ["energy", "data", "alloy"];

export function computeStimuli(state: WorldState): Stimuli {
  const activeBuildings = state.buildings.length;
  const upkeepDemand = {
    energy: activeBuildings,
    data: activeBuildings,
  };
  const targetStock = Math.max(10, (upkeepDemand.energy + upkeepDemand.data) * 1.5);
  const deficits: Record<ResourceKind, number> = { energy: 0, data: 0, alloy: 0 };
  const deficitNormalized: Record<ResourceKind, number> = { energy: 0, data: 0, alloy: 0 };

  RESOURCE_KINDS.forEach((kind) => {
    const current = state.stock[kind];
    const deficit = Math.max(0, targetStock - current);
    deficits[kind] = deficit;
    const denom = Math.max(1, targetStock);
    deficitNormalized[kind] = Math.min(1, deficit / denom);
  });

  const maxDeficitNormalized = Math.max(
    deficitNormalized.energy,
    deficitNormalized.data,
    deficitNormalized.alloy,
  );

  const meg = state.megaproject;
  const totalNeed = meg.need.energy + meg.need.data + meg.need.alloy;
  const totalProgress = meg.progress.energy + meg.progress.data + meg.progress.alloy;
  const progressRatio = totalNeed > 0 ? Math.min(1, totalProgress / totalNeed) : 1;

  let megPressure = clamp(0.2 + 0.6 * (1 - progressRatio), 0, 1);
  megPressure *= clamp(1 - 0.7 * maxDeficitNormalized, 0, 1);

  return {
    deficits,
    deficitNormalized,
    maxDeficitNormalized,
    upkeepDemand,
    megPressure,
    targetStock,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
