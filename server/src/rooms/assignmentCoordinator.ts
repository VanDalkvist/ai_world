import { AgentState, ResourceNode } from "./schema/WorldState";
import { PlannerPlan } from "../ai/schemas";

export interface AssignmentOptions {
  maxWorkersPerNode: number;
  topKCandidates: number;
}

const DEFAULT_OPTIONS: AssignmentOptions = {
  maxWorkersPerNode: 2,
  topKCandidates: 3,
};

export function computeAssignments(
  agents: readonly AgentState[],
  resources: Map<string, ResourceNode>,
  plan: PlannerPlan,
  options: Partial<AssignmentOptions> = {},
): Map<string, string> {
  const { maxWorkersPerNode, topKCandidates } = { ...DEFAULT_OPTIONS, ...options };
  const occupancy = new Map<string, number>();
  const reserved = new Set<string>();

  agents.forEach((agent) => {
    if (!agent.targetId) return;
    if (agent.status === "moving" || agent.status === "gathering") {
      const count = occupancy.get(agent.targetId) ?? 0;
      occupancy.set(agent.targetId, count + 1);
      reserved.add(agent.targetId);
    }
  });

  const assignments = new Map<string, string>();
  const priorityOrder = computeKindOrder(plan.priority);

  const idleAgents = agents
    .filter((agent) => agent.status === "idle")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const agent of idleAgents) {
    let assigned = false;
    for (const kind of priorityOrder) {
      const chosen = pickResourceForAgent(agent, kind, resources, reserved, occupancy, {
        maxWorkersPerNode,
        topKCandidates,
      });
      if (chosen) {
        assignments.set(agent.id, chosen);
        const nextCount = (occupancy.get(chosen) ?? 0) + 1;
        occupancy.set(chosen, nextCount);
        reserved.add(chosen);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      // try any resource regardless of kind if nothing matched
      const chosen = pickResourceForAgent(
        agent,
        null,
        resources,
        reserved,
        occupancy,
        {
          maxWorkersPerNode,
          topKCandidates,
        },
      );
      if (chosen) {
        assignments.set(agent.id, chosen);
        const nextCount = (occupancy.get(chosen) ?? 0) + 1;
        occupancy.set(chosen, nextCount);
        reserved.add(chosen);
      }
    }
  }

  return assignments;
}

function computeKindOrder(priority: ResourceNode["kind"]) {
  const kinds: ResourceNode["kind"][] = ["energy", "data", "alloy"];
  const order = [priority, ...kinds.filter((k) => k !== priority)];
  return order;
}

function pickResourceForAgent(
  agent: AgentState,
  desiredKind: ResourceNode["kind"] | null,
  resources: Map<string, ResourceNode>,
  reserved: Set<string>,
  occupancy: Map<string, number>,
  options: AssignmentOptions,
) {
  const candidates: { id: string; node: ResourceNode; dist: number }[] = [];
  resources.forEach((node, id) => {
    if (desiredKind && node.kind !== desiredKind) return;
    if (reserved.has(id)) return;
    if (node.amount <= 0) return;
    if ((occupancy.get(id) ?? 0) >= options.maxWorkersPerNode) return;
    const dist = Math.abs(node.x - agent.x) + Math.abs(node.y - agent.y);
    candidates.push({ id, node, dist });
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id));
  const topCandidates = candidates.slice(0, options.topKCandidates);
  const pickIndex = deterministicPickIndex(agent.id, topCandidates.length);
  return topCandidates[pickIndex]?.id ?? null;
}

function deterministicPickIndex(agentId: string, length: number) {
  if (length <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}
