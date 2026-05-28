import { WorldState, ResourceBundle, MegaprojectState } from "./schema/WorldState";

type StageConfig = {
  name: string;
  need: ResourceAmounts;
  requiredWorkers: number;
};

type ResourceAmounts = {
  energy: number;
  data: number;
  alloy: number;
};

const BASE_STAGES: StageConfig[] = [
  { name: "Arcology Core", need: { energy: 30, data: 30, alloy: 30 }, requiredWorkers: 2 },
  { name: "District Spires", need: { energy: 80, data: 80, alloy: 80 }, requiredWorkers: 2 },
  { name: "Orbital Elevator", need: { energy: 200, data: 200, alloy: 200 }, requiredWorkers: 3 },
];

export function ensureMegaprojectInitialized(state: WorldState) {
  if (!state.megaproject.stageName || state.megaproject.stageIndex < 0) {
    configureStage(state, 0);
  }
}

export function getRemainingNeed(state: WorldState) {
  const meg = state.megaproject;
  return {
    energy: Math.max(0, meg.need.energy - meg.progress.energy),
    data: Math.max(0, meg.need.data - meg.progress.data),
    alloy: Math.max(0, meg.need.alloy - meg.progress.alloy),
  };
}

export function tickMegaproject(state: WorldState, workerCount: number) {
  ensureMegaprojectInitialized(state);
  const meg = state.megaproject;
  if (workerCount < meg.requiredWorkers) {
    return;
  }

  let progressMade = false;
  const remaining = getRemainingNeed(state);
  (["energy", "data", "alloy"] as const).forEach((kind) => {
    if (remaining[kind] <= 0) {
      return;
    }
    const available = state.stock[kind];
    if (available <= 0) {
      return;
    }
    const delta = Math.min(1, remaining[kind], available);
    state.stock[kind] -= delta;
    (meg.progress as ResourceBundle)[kind] += delta;
    progressMade = true;
  });

  if (progressMade && isStageComplete(meg)) {
    advanceStage(state);
  }
}

function isStageComplete(meg: MegaprojectState) {
  return (
    meg.progress.energy >= meg.need.energy &&
    meg.progress.data >= meg.need.data &&
    meg.progress.alloy >= meg.need.alloy
  );
}

function advanceStage(state: WorldState) {
  const nextIndex = state.megaproject.stageIndex + 1;
  state.epoch += 1;
  configureStage(state, nextIndex);
}

function configureStage(state: WorldState, stageIndex: number) {
  const config = getStageConfig(stageIndex);
  state.megaproject.stageIndex = stageIndex;
  state.megaproject.stageName = config.name;
  state.megaproject.requiredWorkers = config.requiredWorkers;
  state.megaproject.need.energy = config.need.energy;
  state.megaproject.need.data = config.need.data;
  state.megaproject.need.alloy = config.need.alloy;
  state.megaproject.progress.energy = 0;
  state.megaproject.progress.data = 0;
  state.megaproject.progress.alloy = 0;
  state.megaproject.siteX = Math.floor(state.width / 2);
  state.megaproject.siteY = Math.floor(state.height / 2);
}

function getStageConfig(stageIndex: number): StageConfig {
  if (stageIndex < BASE_STAGES.length) {
    return BASE_STAGES[stageIndex];
  }
  const extraIndex = stageIndex - BASE_STAGES.length;
  const base = BASE_STAGES[BASE_STAGES.length - 1];
  const scale = Math.pow(2.2, extraIndex + 1);
  return {
    name: `Singularity Gate ${extraIndex + 1}`,
    need: {
      energy: Math.round(base.need.energy * scale),
      data: Math.round(base.need.data * scale),
      alloy: Math.round(base.need.alloy * scale),
    },
    requiredWorkers: base.requiredWorkers + extraIndex,
  };
}
