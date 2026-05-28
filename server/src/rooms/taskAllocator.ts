import { PlannerPlan } from "../ai/schemas";
import { WorldState, ResourceKind } from "./schema/WorldState";
import { Stimuli } from "./stimuli";
import { MegQuota } from "./quotas";

const RESOURCE_KINDS: ResourceKind[] = ["energy", "data", "alloy"];
const MAX_WORKERS_PER_NODE = 2;
const HYSTERESIS_TICKS = 6;
const HYSTERESIS_PENALTY = 0.3;

export function allocateTasks(
  state: WorldState,
  plan: PlannerPlan,
  stimuli: Stimuli,
  quota: MegQuota,
) {
  const occupancy = new Map<string, number>();
  const reserved = new Set<string>();
  state.agents.forEach((agent) => {
    if (agent.taskKind === "gather" && agent.targetId) {
      const count = occupancy.get(agent.targetId) ?? 0;
      occupancy.set(agent.targetId, count + 1);
      if (agent.status !== "idle") {
        reserved.add(agent.targetId);
      }
    }
  });

  let currentMeg = countActiveMegAgents(state);
  const maxMeg = quota.count;
  const idleAgents = state.agents.filter((agent) => agent.status === "idle");
  const maxDist = Math.max(1, state.width + state.height);
  const megTarget = { x: state.megaproject.siteX, y: state.megaproject.siteY };

  idleAgents.sort((a, b) => a.id.localeCompare(b.id));

  for (const agent of idleAgents) {
    const gatherChoice = pickGatherTarget(agent, state, plan, stimuli, occupancy, reserved, maxDist);
    const megScore = computeMegUtility(agent, state, stimuli, megTarget, maxDist);
    const gatherScore = gatherChoice?.score ?? -Infinity;

    let assignMeg = false;
    if (currentMeg < maxMeg && megScore > gatherScore) {
      assignMeg = true;
    }

    if (assignMeg && megScore > -Infinity) {
      setAgentMegabuild(agent, state);
      currentMeg++;
      continue;
    }

    if (gatherChoice) {
      setAgentGather(agent, gatherChoice.id, state);
      const nextCount = (occupancy.get(gatherChoice.id) ?? 0) + 1;
      occupancy.set(gatherChoice.id, nextCount);
      reserved.add(gatherChoice.id);
    } else {
      agent.taskKind = "idle";
      agent.targetId = null;
      agent.lastTaskTick = state.tick;
    }
  }
}

function countActiveMegAgents(state: WorldState) {
  return state.agents.filter((agent) => agent.taskKind === "megabuild").length;
}

function pickGatherTarget(
  agent: WorldState["agents"][number],
  state: WorldState,
  plan: PlannerPlan,
  stimuli: Stimuli,
  occupancy: Map<string, number>,
  reserved: Set<string>,
  maxDist: number,
) {
  let bestScore = -Infinity;
  let bestId: string | null = null;

  state.resources.forEach((node, id) => {
    if (node.amount <= 0) return;
    if (reserved.has(id)) return;
    if ((occupancy.get(id) ?? 0) >= MAX_WORKERS_PER_NODE) return;
    const score = computeGatherUtility(agent, node, plan, stimuli, maxDist);
    const penalty = hysteresisPenalty(agent, "gather", state.tick);
    const finalScore = score - penalty;
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestId = id;
    }
  });

  if (!bestId) return null;
  return { id: bestId, score: bestScore };
}

function computeGatherUtility(
  agent: WorldState["agents"][number],
  node: { x: number; y: number; kind: ResourceKind },
  plan: PlannerPlan,
  stimuli: Stimuli,
  maxDist: number,
) {
  const deficit = stimuli.deficitNormalized[node.kind];
  const priorityBoost = plan.priority === node.kind ? 0.2 : 0;
  const dist = manhattan(agent.x, agent.y, node.x, node.y);
  const distScore = 1 - Math.min(1, dist / maxDist);
  return deficit * 0.6 + distScore * 0.2 + priorityBoost;
}

function computeMegUtility(
  agent: WorldState["agents"][number],
  state: WorldState,
  stimuli: Stimuli,
  target: { x: number; y: number },
  maxDist: number,
) {
  const dist = manhattan(agent.x, agent.y, target.x, target.y);
  const distScore = 1 - Math.min(1, dist / maxDist);
  const base =
    stimuli.megPressure * 0.8 + distScore * 0.2 - stimuli.maxDeficitNormalized * 0.8;
  const penalty = hysteresisPenalty(agent, "megabuild", state.tick);
  return base - penalty;
}

function setAgentMegabuild(agent: WorldState["agents"][number], state: WorldState) {
  agent.taskKind = "megabuild";
  agent.targetId = "__MEGAPROJECT__";
  agent.status = "moving";
  agent.lastTaskTick = state.tick;
}

function setAgentGather(agent: WorldState["agents"][number], resourceId: string, state: WorldState) {
  agent.taskKind = "gather";
  agent.targetId = resourceId;
  agent.status = "moving";
  agent.lastTaskTick = state.tick;
}

function hysteresisPenalty(
  agent: WorldState["agents"][number],
  desiredKind: "gather" | "megabuild",
  currentTick: number,
) {
  if (agent.taskKind === desiredKind) return 0;
  if (currentTick - agent.lastTaskTick < HYSTERESIS_TICKS) {
    return HYSTERESIS_PENALTY;
  }
  return 0;
}

function manhattan(ax: number, ay: number, bx: number, by: number) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
