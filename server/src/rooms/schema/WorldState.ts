import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export type ResourceKind = "energy" | "data" | "alloy";

export class ResourceNode extends Schema {
  @type("string") kind: ResourceKind = "energy";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") amount = 10;
}

export class AgentState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") status: "idle" | "moving" | "gathering" | "building" = "idle";
  @type("string") targetId: string | null = null;
  @type("string") taskKind: "idle" | "gather" | "megabuild" = "idle";
  @type("number") lastTaskTick = 0;

  @type("number") energy = 0;
  @type("number") data = 0;
  @type("number") alloy = 0;
}

export class Building extends Schema {
  @type("string") kind: "hub" = "hub";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("boolean") active = true;
}

export class ResourceBundle extends Schema {
  @type("number") energy = 0;
  @type("number") data = 0;
  @type("number") alloy = 0;
}

export class Stock extends ResourceBundle {}

export class MegaprojectState extends Schema {
  @type("number") stageIndex = -1;
  @type("string") stageName = "";
  @type("number") requiredWorkers = 2;
  @type(ResourceBundle) need = new ResourceBundle();
  @type(ResourceBundle) progress = new ResourceBundle();
  @type("number") siteX = 0;
  @type("number") siteY = 0;
}

export class PolicyState extends Schema {
  @type("number") megQuotaRatio = 0;
  @type("number") megPressure = 0;
}

export class WorldState extends Schema {
  @type({ map: ResourceNode }) resources = new MapSchema<ResourceNode>();
  @type([AgentState]) agents = new ArraySchema<AgentState>();
  @type([Building]) buildings = new ArraySchema<Building>();

  @type("number") tick = 0;
  @type("number") width = 10;
  @type("number") height = 10;
  @type(Stock) stock = new Stock();
  @type("number") epoch = 1;
  @type("string") crisisKind: "none" | "storm" | "blackout" | "virus" = "none";
  @type("number") crisisTicksLeft = 0;
  @type("string") latestPlanPriority: ResourceKind | null = null;
  @type(MegaprojectState) megaproject = new MegaprojectState();
  @type(PolicyState) policy = new PolicyState();
}
