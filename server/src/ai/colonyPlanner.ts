import { Agent } from "@mastra/core/agent";
import { plannerInstructions } from "./plannerPrompt";

const mastraModel =
  process.env.MASTRA_MODEL ?? process.env.OPENROUTER_PLANNER_MODEL ?? "openai/gpt-4o-mini";

export const colonyPlanner = new Agent({
  name: "ColonyPlanner",
  instructions: plannerInstructions,
  model: mastraModel,
  tools: {},
});
