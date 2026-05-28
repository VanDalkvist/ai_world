import { WorldState } from "../rooms/schema/WorldState";
import { WorldSnapshot } from "./schemas";

export function buildWorldSnapshot(state: WorldState): WorldSnapshot {
  return {
    tick: state.tick,
    width: state.width,
    height: state.height,
    epoch: state.epoch,
    stock: {
      energy: state.stock.energy,
      data: state.stock.data,
      alloy: state.stock.alloy,
    },
    crisis: {
      kind: state.crisisKind,
      ticksLeft: state.crisisTicksLeft,
    },
    megaproject: {
      stageIndex: state.megaproject.stageIndex,
      stageName: state.megaproject.stageName,
      requiredWorkers: state.megaproject.requiredWorkers,
      need: {
        energy: state.megaproject.need.energy,
        data: state.megaproject.need.data,
        alloy: state.megaproject.need.alloy,
      },
      progress: {
        energy: state.megaproject.progress.energy,
        data: state.megaproject.progress.data,
        alloy: state.megaproject.progress.alloy,
      },
      siteX: state.megaproject.siteX,
      siteY: state.megaproject.siteY,
    },
    policy: {
      megQuotaRatio: state.policy.megQuotaRatio,
      megPressure: state.policy.megPressure,
    },
    resources: Array.from(state.resources.entries()).map(([id, resource]) => ({
      id,
      kind: resource.kind,
      x: resource.x,
      y: resource.y,
      amount: resource.amount,
    })),
    agents: state.agents.map((agent) => ({
      id: agent.id,
      x: agent.x,
      y: agent.y,
      energy: agent.energy,
      data: agent.data,
      alloy: agent.alloy,
      status: agent.status,
      targetId: agent.targetId,
      taskKind: agent.taskKind,
    })),
    buildings: state.buildings.map((building) => ({
      kind: building.kind,
      x: building.x,
      y: building.y,
      active: building.active,
    })),
  };
}
