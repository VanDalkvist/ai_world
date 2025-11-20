import { Room, Client } from "@colyseus/core";
import { nanoid } from "nanoid";
import { WorldState, ResourceNode, AgentState, Building } from "./schema/WorldState";
import { plannerService } from "../ai/plannerService";
import { buildWorldSnapshot } from "../ai/worldSnapshot";
import { PlannerPlan } from "../ai/schemas";
import { computeAssignments } from "./assignmentCoordinator";

const PLAN_INTERVAL_TICKS = 10;
const WORLD_WIDTH = 32;
const WORLD_HEIGHT = 32;
const RESOURCE_COUNT = 40;
const AGENT_COUNT = 6;
const MAX_WORKERS_PER_NODE = 2;
const TOP_K_CANDIDATES = 3;
const RESOURCE_MAX_AMOUNT = 20;
const RESOURCE_REGEN_AMOUNT = 1;
const RESOURCE_REGEN_INTERVAL = 5;
const RESOURCE_SPAWN_INTERVAL = 40;
const UPKEEP_ENERGY_PER_BUILDING = 1;
const UPKEEP_DATA_PER_BUILDING = 1;
const BUILD_COST = { energy: 3, data: 3, alloy: 3 };

export class MyRoom extends Room<WorldState> {
  onCreate() {
    this.setState(new WorldState());
    this.state.width = WORLD_WIDTH;
    this.state.height = WORLD_HEIGHT;
    this.state.stock.energy = 0;
    this.state.stock.data = 0;
    this.state.stock.alloy = 0;

    const kinds: ResourceNode["kind"][] = ["energy", "data", "alloy"];
    for (let i = 0; i < RESOURCE_COUNT; i++) {
      const r = new ResourceNode();
      r.kind = kinds[i % kinds.length];
      r.x = Math.floor(Math.random() * WORLD_WIDTH);
      r.y = Math.floor(Math.random() * WORLD_HEIGHT);
      r.amount = 8 + Math.floor(Math.random() * 8);
      this.state.resources.set(nanoid(), r);
    }

    for (let i = 0; i < AGENT_COUNT; i++) {
      const a = new AgentState();
      a.id = `npc-${i}`;
      a.x = 1 + (i % 4);
      a.y = 1 + Math.floor(i / 4);
      this.state.agents.push(a);
    }

    this.setSimulationInterval(() => this.updateWorld(), 500);
  }

  onJoin(_client: Client) {
    // observer-only for now
  }

  updateWorld() {
    this.state.tick++;
    if (this.state.tick % PLAN_INTERVAL_TICKS === 0) {
      const snapshot = buildWorldSnapshot(this.state);
      plannerService.submitSnapshot(snapshot);
    }
    const plan = plannerService.getLatestPlan() ?? buildFallbackPlan(this.state);
    this.applyAssignments(plan);

    for (const a of this.state.agents) {
      if (a.status === "idle") {
        continue;
      }

      if (a.status === "moving" && a.targetId) {
        const target = this.state.resources.get(a.targetId);
        if (!target) {
          a.status = "idle";
          a.targetId = null;
          continue;
        }

        if (a.x < target.x) a.x++;
        else if (a.x > target.x) a.x--;
        else if (a.y < target.y) a.y++;
        else if (a.y > target.y) a.y--;

        if (a.x === target.x && a.y === target.y) {
          a.status = "gathering";
        }
      }

      if (a.status === "gathering" && a.targetId) {
        const target = this.state.resources.get(a.targetId);
        if (!target) {
          a.status = "idle";
          a.targetId = null;
          continue;
        }

        if (target.amount > 0) {
          target.amount--;
          (a as any)[target.kind]++;
        }

        if (target.amount <= 0) {
          target.amount = 0;
          a.targetId = null;
          a.status = "idle";
        }
      }
    }

    this.transferAgentResourcesToStock();
    this.tryBuildFromStock();
    this.applyBuildingUpkeep();
    if (this.state.tick % RESOURCE_SPAWN_INTERVAL === 0) {
      this.spawnResourceNode();
    }
    if (this.state.tick % RESOURCE_REGEN_INTERVAL === 0) {
      this.regenResources();
    }
  }

  applyAssignments(plan: PlannerPlan) {
    const resourceMap = new Map<string, ResourceNode>();
    this.state.resources.forEach((node, id) => resourceMap.set(id, node));
    const assignments = computeAssignments(this.state.agents, resourceMap, plan, {
      maxWorkersPerNode: MAX_WORKERS_PER_NODE,
      topKCandidates: TOP_K_CANDIDATES,
    });
    if (assignments.size > 0) {
      console.debug(
        `[Assignments] tick=${this.state.tick} priority=${plan.priority} idleAssigned=${assignments.size}`,
      );
    }
    for (const agent of this.state.agents) {
      if (agent.status !== "idle") continue;
      const targetId = assignments.get(agent.id);
      if (!targetId) continue;
      agent.targetId = targetId;
      agent.status = "moving";
    }
  }

  private regenResources() {
    this.state.resources.forEach((node) => {
      if (node.amount < RESOURCE_MAX_AMOUNT) {
        node.amount = Math.min(RESOURCE_MAX_AMOUNT, node.amount + RESOURCE_REGEN_AMOUNT);
      }
    });
  }

  private spawnResourceNode() {
    const kinds: ResourceNode["kind"][] = ["energy", "data", "alloy"];
    const node = new ResourceNode();
    node.kind = kinds[randomInt(kinds.length)];
    node.x = randomInt(this.state.width);
    node.y = randomInt(this.state.height);
    node.amount = 8 + randomInt(8);
    this.state.resources.set(nanoid(), node);
  }

  private transferAgentResourcesToStock() {
    let totalEnergy = 0;
    let totalData = 0;
    let totalAlloy = 0;
    for (const agent of this.state.agents) {
      if (agent.energy > 0) {
        totalEnergy += agent.energy;
      }
      agent.energy = 0;
      if (agent.data > 0) {
        totalData += agent.data;
      }
      agent.data = 0;
      if (agent.alloy > 0) {
        totalAlloy += agent.alloy;
      }
      agent.alloy = 0;
    }
    if (totalEnergy || totalData || totalAlloy) {
      this.state.stock.energy += totalEnergy;
      this.state.stock.data += totalData;
      this.state.stock.alloy += totalAlloy;
      console.debug(
        `[Stock] tick=${this.state.tick} +${totalEnergy}/${totalData}/${totalAlloy} -> ${this.state.stock.energy}/${this.state.stock.data}/${this.state.stock.alloy}`,
      );
    }
  }

  private applyBuildingUpkeep() {
    let availableEnergy = this.state.stock.energy;
    let availableData = this.state.stock.data;
    let activeCount = 0;

    for (const building of this.state.buildings) {
      if (
        availableEnergy >= UPKEEP_ENERGY_PER_BUILDING &&
        availableData >= UPKEEP_DATA_PER_BUILDING
      ) {
        building.active = true;
        availableEnergy -= UPKEEP_ENERGY_PER_BUILDING;
        availableData -= UPKEEP_DATA_PER_BUILDING;
        activeCount++;
      } else {
        building.active = false;
      }
    }

    this.state.stock.energy = Math.max(0, availableEnergy);
    this.state.stock.data = Math.max(0, availableData);
    if (this.state.buildings.length > 0 && this.state.tick % 10 === 0) {
      console.debug(
        `[Upkeep] tick=${this.state.tick} active=${activeCount}/${this.state.buildings.length} stock=${this.state.stock.energy}/${this.state.stock.data}/${this.state.stock.alloy}`,
      );
    }
  }

  private tryBuildFromStock() {
    if (
      this.state.stock.energy < BUILD_COST.energy ||
      this.state.stock.data < BUILD_COST.data ||
      this.state.stock.alloy < BUILD_COST.alloy
    ) {
      return;
    }
    const builder = this.state.agents.find((agent) => agent.status === "idle");
    if (!builder) return;

    this.state.stock.energy -= BUILD_COST.energy;
    this.state.stock.data -= BUILD_COST.data;
    this.state.stock.alloy -= BUILD_COST.alloy;

    const building = new Building();
    building.x = builder.x;
    building.y = builder.y;
    building.active = true;
    this.state.buildings.push(building);
    builder.status = "building";
    builder.targetId = null;

    console.log(
      `[Build] tick=${this.state.tick} @(${building.x},${building.y}) stock=${this.state.stock.energy}/${this.state.stock.data}/${this.state.stock.alloy}`,
    );

    builder.status = "idle";
  }
}

function buildFallbackPlan(state: WorldState): PlannerPlan {
  const target = { energy: 6, data: 6, alloy: 6 };
  const deficits: Record<ResourceNode["kind"], number> = {
    energy: Math.max(0, target.energy - state.stock.energy),
    data: Math.max(0, target.data - state.stock.data),
    alloy: Math.max(0, target.alloy - state.stock.alloy),
  };

  let priority: ResourceNode["kind"] = "energy";
  let maxDeficit = -1;
  (["energy", "data", "alloy"] as ResourceNode["kind"][]).forEach((kind) => {
    if (deficits[kind] > maxDeficit) {
      maxDeficit = deficits[kind];
      priority = kind;
    }
  });

  if (maxDeficit <= 0) {
    const order: ResourceNode["kind"][] = ["energy", "data", "alloy"];
    priority = order[state.tick % order.length];
  }

  console.debug(
    `[FallbackPlan] tick=${state.tick} priority=${priority} stock=${state.stock.energy}/${state.stock.data}/${state.stock.alloy}`,
  );

  return { priority, buildHub: null };
}

function randomInt(maxExclusive: number) {
  return Math.floor(Math.random() * maxExclusive);
}
