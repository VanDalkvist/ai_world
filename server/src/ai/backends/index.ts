import { IPlannerBackend } from "./IPlannerBackend";
import { MastraPlannerBackend } from "./MastraPlannerBackend";
import { OpenRouterPlannerBackend } from "./OpenRouterPlannerBackend";

function createPlannerBackends(): IPlannerBackend[] {
  const preferred = (process.env.PLANNER_BACKEND ?? "mastra").toLowerCase();
  const backends: IPlannerBackend[] = [];

  if (preferred === "mastra") {
    backends.push(new MastraPlannerBackend());
    backends.push(new OpenRouterPlannerBackend());
  } else {
    backends.push(new OpenRouterPlannerBackend());
  }

  return backends;
}

export const plannerBackends = createPlannerBackends();

const backendNames = plannerBackends.map((backend) => backend.name).join(" -> ");
console.log(`[PlannerService] Backends configured: ${backendNames}`);
