import { Agent } from "@mastra/core/agent";

export const colonyPlanner = new Agent({
  name: "ColonyPlanner",
  instructions: `Ты планировщик колонии нейросетей.
Смотри на состояние мира и предлагаешь следующую коллективную цель:
- "gather" (какой ресурс приоритетен)
- "buildHub" (где поставить хаб)
Возвращай компактный JSON.`,
  model: "openai/gpt-4o-mini",
  tools: {},
});
