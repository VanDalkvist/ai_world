import { ChatMessage } from "./openrouterClient";
import { WorldSnapshot } from "./schemas";

const schemaDescription = `{
  "priority": "energy" | "data" | "alloy",
  "buildHub": { "x": number, "y": number } | null
}`;

export const plannerInstructions = [
  "Ты планировщик колонии нейросетей.",
  "Получишь полный JSON состояния мира: ресурсы, агенты, здания, тики.",
  "Проанализируй баланс ресурсов и предложи следующую коллективную цель.",
  "Ответь ТОЛЬКО валидным JSON без комментариев и текстов.",
  `Схема ответа: ${schemaDescription}`,
  'Если хаб строить не нужно, укажи "buildHub": null.',
].join("\n");

export function buildPlannerUserPrompt(snapshot: WorldSnapshot): string {
  const snapshotString = JSON.stringify(snapshot, null, 2);
  return [
    "Текущее состояние мира:",
    "```json",
    snapshotString,
    "```",
    "Верни JSON-план стратегии согласно схеме.",
  ].join("\n");
}

export function buildPlannerMessages(snapshot: WorldSnapshot): ChatMessage[] {
  return [
    { role: "system", content: plannerInstructions },
    { role: "user", content: buildPlannerUserPrompt(snapshot) },
  ];
}
