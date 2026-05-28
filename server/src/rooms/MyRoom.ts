import { Room, Client } from "@colyseus/core";
import { nanoid } from "nanoid";
import {
  WorldState,
  ResourceKind,
  AgentState,
  Building,
  ResourceNode,
} from "./schema/WorldState";
import { plannerService } from "../ai/plannerService";
import { buildWorldSnapshot } from "../ai/worldSnapshot";
import { PlannerPlan } from "../ai/schemas";
import { ensureMegaprojectInitialized, tickMegaproject } from "./megaprojectEngine";
import { computeStimuli } from "./stimuli";
import { computeMegQuota } from "./quotas";
import { allocateTasks } from "./taskAllocator";

const PLAN_INTERVAL_TICKS = 10;
const WORLD_WIDTH = 32;
const WORLD_HEIGHT = 32;
const RESOURCE_COUNT = 40;
const AGENT_COUNT = 6;
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

    const kinds: ResourceKind[] = ["energy", "data", "alloy"];
    for (let i = 0; i < RESOURCE_COUNT; i++) {
      const node = new ResourceNode();
      node.kind = kinds[i % kinds.length];
      node.x = Math.floor(Math.random() * WORLD_WIDTH);
      node.y = Math.floor(Math.random() * WORLD_HEIGHT);
      node.amount = 8 + Math.floor(Math.random() * 8);
      this.state.resources.set(nanoid(), node);
    }

    for (let i = 0; i < AGENT_COUNT; i++) {
      const agent = new AgentState();
      agent.id = `npc-${i}`;
      agent.x = 1 + (i % 4);
      agent.y = 1 + Math.floor(i / 4);
      this.state.agents.push(agent);
    }

    ensureMegaprojectInitialized(this.state);
    this.setSimulationInterval(() => this.updateWorld(), 500);
  }

  onJoin(_client: Client) {
    // observer-only for now
  }

  updateWorld() {
    this.state.tick++;
    ensureMegaprojectInitialized(this.state);

    if (this.state.tick % PLAN_INTERVAL_TICKS === 0) {
      const snapshot = buildWorldSnapshot(this.state);
      plannerService.submitSnapshot(snapshot);
    }
    const plan = plannerService.getLatestPlan() ?? buildFallbackPlan(this.state);
    this.state.latestPlanPriority = plan.priority;

    const stimuli = computeStimuli(this.state);
    const quota = computeMegQuota(stimuli, this.state.agents.length);
    this.state.policy.megQuotaRatio = quota.ratio;
    this.state.policy.megPressure = stimuli.megPressure;

    allocateTasks(this.state, plan, stimuli, quota);

    this.updateAgents();
    this.transferAgentResourcesToStock();
    this.tryBuildFromStock(stimuli);
    const megWorkers = this.normalizeMegWorkers();
    tickMegaproject(this.state, megWorkers);
    this.applyBuildingUpkeep();

    if (this.state.tick % RESOURCE_SPAWN_INTERVAL === 0) {
      this.spawnResourceNode();
    }
    if (this.state.tick % RESOURCE_REGEN_INTERVAL === 0) {
      this.regenResources();
    }
  }

  private updateAgents() {
    for (const agent of this.state.agents) {
      if (agent.status === "idle") continue;
      if (agent.taskKind === "megabuild") {
        this.updateMegabuildAgent(agent);
        continue;
      }
      this.updateGatheringAgent(agent);
    }
  }

  private updateGatheringAgent(agent: AgentState) {
    if (agent.status === "moving" && agent.targetId) {
      const target = this.state.resources.get(agent.targetId);
      if (!target) {
        this.resetAgent(agent);
        return;
      }
      this.stepTowards(agent, target.x, target.y);
      if (agent.x === target.x && agent.y === target.y) {
        agent.status = "gathering";
      }
      return;
    }

    if (agent.status === "gathering" && agent.targetId) {
      const target = this.state.resources.get(agent.targetId);
      if (!target) {
        this.resetAgent(agent);
        return;
      }
      if (target.amount > 0) {
        target.amount--;
        (agent as any)[target.kind]++;
      }
      if (target.amount <= 0) {
        target.amount = 0;
        this.resetAgent(agent);
      }
    }
  }

  private updateMegabuildAgent(agent: AgentState) {
    const targetX = this.state.megaproject.siteX;
    const targetY = this.state.megaproject.siteY;

    if (agent.status === "moving") {
      this.stepTowards(agent, targetX, targetY);
      if (agent.x === targetX && agent.y === targetY) {
        agent.status = "building";
      }
      return;
    }

    if (agent.status === "building") {
      // worker stays on site
      return;
    }

    this.resetAgent(agent);
  }

  private stepTowards(agent: AgentState, targetX: number, targetY: number) {
    if (agent.x < targetX) agent.x++;
    else if (agent.x > targetX) agent.x--;
    else if (agent.y < targetY) agent.y++;
    else if (agent.y > targetY) agent.y--;
  }

  private resetAgent(agent: AgentState) {
    agent.status = "idle";
    agent.targetId = null;
    agent.taskKind = "idle";
    agent.lastTaskTick = this.state.tick;
  }

  private transferAgentResourcesToStock() {
    let totalEnergy = 0;
    let totalData = 0;
    let totalAlloy = 0;
    for (const agent of this.state.agents) {
      totalEnergy += agent.energy;
      totalData += agent.data;
      totalAlloy += agent.alloy;
      agent.energy = 0;
      agent.data = 0;
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

  private tryBuildFromStock(stimuli: ReturnType<typeof computeStimuli>) {
    const stockOk =
      this.state.stock.energy >= BUILD_COST.energy * 3 &&
      this.state.stock.data >= BUILD_COST.data * 3 &&
      this.state.stock.alloy >= BUILD_COST.alloy * 3;
    const pressureOk = stimuli.megPressure < 0.8;
    if (!stockOk || !pressureOk) return;

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
    console.log(
      `[Build] tick=${this.state.tick} @(${building.x},${building.y}) stock=${this.state.stock.energy}/${this.state.stock.data}/${this.state.stock.alloy}`,
    );
  }

  private applyBuildingUpkeep() {
    let availableEnergy = this.state.stock.energy;
    let availableData = this.state.stock.data;
    let active = 0;

    for (const building of this.state.buildings) {
      if (
        availableEnergy >= UPKEEP_ENERGY_PER_BUILDING &&
        availableData >= UPKEEP_DATA_PER_BUILDING
      ) {
        building.active = true;
        availableEnergy -= UPKEEP_ENERGY_PER_BUILDING;
        availableData -= UPKEEP_DATA_PER_BUILDING;
        active++;
      } else {
        building.active = false;
      }
    }

    this.state.stock.energy = Math.max(0, availableEnergy);
    this.state.stock.data = Math.max(0, availableData);
    if (this.state.tick % 10 === 0) {
      console.debug(
        `[Upkeep] tick=${this.state.tick} active=${active}/${this.state.buildings.length} stock=${this.state.stock.energy}/${this.state.stock.data}/${this.state.stock.alloy}`,
      );
    }
  }

  private normalizeMegWorkers() {
    const required = this.state.megaproject.requiredWorkers;
    const builders = this.state.agents
      .filter((agent) => agent.taskKind === "megabuild" && agent.status === "building")
      .sort((a, b) => a.lastTaskTick - b.lastTaskTick);

    if (builders.length <= required) {
      return builders.length;
    }

    builders.slice(required).forEach((agent) => this.resetAgent(agent));
    return required;
  }

  private regenResources() {
    this.state.resources.forEach((node) => {
      if (node.amount < RESOURCE_MAX_AMOUNT) {
        node.amount = Math.min(RESOURCE_MAX_AMOUNT, node.amount + RESOURCE_REGEN_AMOUNT);
      }
    });
  }

  private spawnResourceNode() {
    const kinds: ResourceKind[] = ["energy", "data", "alloy"];
    const node = new ResourceNode();
    node.kind = kinds[randomInt(kinds.length)];
    node.x = randomInt(this.state.width);
    node.y = randomInt(this.state.height);
    node.amount = 8 + randomInt(8);
    this.state.resources.set(nanoid(), node);
  }
}

function buildFallbackPlan(state: WorldState): PlannerPlan {
  const target = { energy: 6, data: 6, alloy: 6 };
  const deficits: Record<ResourceKind, number> = {
    energy: Math.max(0, target.energy - state.stock.energy),
    data: Math.max(0, target.data - state.stock.data),
    alloy: Math.max(0, target.alloy - state.stock.alloy),
  };

  let priority: ResourceKind = "energy";
  let maxDeficit = -1;
  (["energy", "data", "alloy"] as ResourceKind[]).forEach((kind) => {
    if (deficits[kind] > maxDeficit) {
      maxDeficit = deficits[kind];
      priority = kind;
    }
  });

  if (maxDeficit <= 0) {
    const order: ResourceKind[] = ["energy", "data", "alloy"];
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
