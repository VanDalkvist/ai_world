import { ChatMessage } from "./openrouterClient";
import { WorldSnapshot } from "./schemas";

const schemaDescription = `{
  "priority": "energy" | "data" | "alloy",
  "buildHub": { "x": number, "y": number } | null
}`;

export function buildPlannerMessages(snapshot: WorldSnapshot): ChatMessage[] {
  const systemMessage: ChatMessage = {
    role: "system",
    content: [
      "Ты планировщик колонии нейросетей.",
      "Получишь полный JSON состояния мира: ресурсы, агенты, здания, тики.",
      "Проанализируй баланс ресурсов и предложи общую стратегию добычи и строительства.",
      "Ответь ТОЛЬКО валидным JSON без комментариев и текстов.",
      `Схема ответа: ${schemaDescription}`,
      'Если хаб строить не нужно, укажи "buildHub": null.',
    ].join("\n"),
  };

  const snapshotString = JSON.stringify(snapshot, null, 2);
  const userMessage: ChatMessage = {
    role: "user",
    content: [
      "Текущее состояние мира:",
      "```json",
      snapshotString,
      "```",
      "Верни JSON-план стратегии согласно схеме.",
    ].join("\n"),
  };

  return [systemMessage, userMessage];
}
