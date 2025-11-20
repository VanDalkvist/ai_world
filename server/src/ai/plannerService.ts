import { createHash } from "crypto";
import { PlannerPlan, plannerPlanSchema, WorldSnapshot } from "./schemas";
import { plannerBackends } from "./backends";

const CACHE_LIMIT = 100;

class PlannerService {
  private readonly backends = plannerBackends;
  private latestPlan: PlannerPlan | null = null;
  private lastSnapshotHash: string | null = null;
  private lastUpdatedAt: number | null = null;
  private inFlight = false;
  private queuedSnapshot: { snapshot: WorldSnapshot; hash: string } | null = null;
  private cache = new Map<string, PlannerPlan>();

  submitSnapshot(snapshot: WorldSnapshot) {
    const hash = hashSnapshot(snapshot);
    if (hash === this.lastSnapshotHash) {
      console.debug("[PlannerService] Snapshot unchanged, skip request");
      return;
    }
    if (this.inFlight) {
      console.debug("[PlannerService] Planner busy, queueing latest snapshot");
      this.queuedSnapshot = { snapshot, hash };
      return;
    }
    this.execute(snapshot, hash);
  }

  getLatestPlan() {
    return this.latestPlan;
  }

  getLastUpdatedAt() {
    return this.lastUpdatedAt;
  }

  private execute(snapshot: WorldSnapshot, hash: string) {
    this.inFlight = true;
    this.runPlanner(snapshot, hash)
      .catch((error) => {
        console.warn("[PlannerService] Failed to fetch plan:", error.message ?? error);
      })
      .finally(() => {
        this.inFlight = false;
        if (this.queuedSnapshot) {
          const pending = this.queuedSnapshot;
          this.queuedSnapshot = null;
          this.submitSnapshot(pending.snapshot);
        }
      });
  }

  private async runPlanner(snapshot: WorldSnapshot, hash: string) {
    const cached = this.cache.get(hash);
    if (cached) {
      console.log("[PlannerService] Reusing cached plan for snapshot");
      this.latestPlan = cached;
      this.lastSnapshotHash = hash;
      this.lastUpdatedAt = Date.now();
      return;
    }

    const start = Date.now();
    console.log(
      `[PlannerService] Requesting new plan (tick=${snapshot.tick}, hash=${hash.slice(0, 8)}…)`,
    );
    const { text, backendName } = await this.fetchWithBackends(snapshot);
    console.debug(`[PlannerService] Raw planner response (${backendName}):`, text);
    const parsedPlan = parsePlannerPlan(text);

    this.cache.set(hash, parsedPlan);
    if (this.cache.size > CACHE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.latestPlan = parsedPlan;
    this.lastUpdatedAt = Date.now();
    this.lastSnapshotHash = hash;
    console.log(
      `[PlannerService] Plan updated in ${Math.round(
        Date.now() - start,
      )}ms via ${backendName} (priority=${parsedPlan.priority})`,
    );
  }

  private async fetchWithBackends(snapshot: WorldSnapshot) {
    let lastError: unknown = null;
    for (const backend of this.backends) {
      try {
        const text = await backend.plan(snapshot);
        return { text, backendName: backend.name };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[PlannerService] Backend ${backend.name} failed: ${message}`);
      }
    }
    throw lastError ?? new Error("No planner backend succeeded");
  }
}

function parsePlannerPlan(text: string): PlannerPlan {
  const jsonCandidate = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch (error) {
    throw new Error(`Planner returned invalid JSON: ${(error as Error).message}`);
  }

  const result = plannerPlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Planner response validation failed: ${result.error.message}`);
  }
  return result.data;
}

function extractJson(raw: string): string {
  if (!raw) {
    return "{}";
  }
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return raw.trim();
}

function hashSnapshot(snapshot: WorldSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export const plannerService = new PlannerService();
