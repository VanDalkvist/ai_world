import { WorldSnapshot } from "../schemas";

export interface IPlannerBackend {
  readonly name: string;
  plan(snapshot: WorldSnapshot): Promise<string>;
}

