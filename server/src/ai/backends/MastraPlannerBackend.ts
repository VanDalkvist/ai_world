import { IPlannerBackend } from "./IPlannerBackend";
import { WorldSnapshot } from "../schemas";
import { buildPlannerUserPrompt } from "../plannerPrompt";
import { colonyPlanner } from "../colonyPlanner";

export class MastraPlannerBackend implements IPlannerBackend {
  readonly name = "mastra";

  async plan(snapshot: WorldSnapshot): Promise<string> {
    const prompt = buildPlannerUserPrompt(snapshot);
    const messages = [{ role: "user", content: prompt }] as any;
    const result = await colonyPlanner.generate(messages);
    return await result.text;
  }
}
