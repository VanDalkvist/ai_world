import { IPlannerBackend } from "./IPlannerBackend";
import { WorldSnapshot } from "../schemas";
import { buildPlannerMessages } from "../plannerPrompt";
import { createChatCompletion } from "../openrouterClient";

const DEFAULT_TIMEOUT = 8000;

export class OpenRouterPlannerBackend implements IPlannerBackend {
  readonly name = "openrouter";

  async plan(snapshot: WorldSnapshot): Promise<string> {
    const messages = buildPlannerMessages(snapshot);
    const { text } = await createChatCompletion(messages, {
      timeoutMs: DEFAULT_TIMEOUT,
      maxTokens: 256,
    });
    return text;
  }
}
