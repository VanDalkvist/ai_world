import { z } from "zod";

export const resourceKindSchema = z.enum(["energy", "data", "alloy"]);
export const agentStatusSchema = z.enum(["idle", "moving", "gathering", "building"]);

const resourceBundleSchema = z.object({
  energy: z.number().int().nonnegative(),
  data: z.number().int().nonnegative(),
  alloy: z.number().int().nonnegative(),
});

export const worldSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  epoch: z.number().int().positive(),
  stock: resourceBundleSchema,
  crisis: z.object({
    kind: z.enum(["none", "storm", "blackout", "virus"]),
    ticksLeft: z.number().int().nonnegative(),
  }),
  megaproject: z.object({
    stageIndex: z.number().int().nonnegative(),
    stageName: z.string(),
    requiredWorkers: z.number().int().nonnegative(),
    need: resourceBundleSchema,
    progress: resourceBundleSchema,
    siteX: z.number().int(),
    siteY: z.number().int(),
  }),
  policy: z
    .object({
      megQuotaRatio: z.number().nonnegative(),
      megPressure: z.number().nonnegative(),
    })
    .optional(),
  resources: z.array(
    z.object({
      id: z.string(),
      kind: resourceKindSchema,
      x: z.number().int(),
      y: z.number().int(),
      amount: z.number().int().nonnegative(),
    }),
  ),
  agents: z.array(
    z.object({
      id: z.string(),
      x: z.number().int(),
      y: z.number().int(),
      energy: z.number().int().nonnegative(),
      data: z.number().int().nonnegative(),
      alloy: z.number().int().nonnegative(),
      status: agentStatusSchema,
      targetId: z.string().nullable(),
      taskKind: z.enum(["idle", "gather", "megabuild"]).optional(),
    }),
  ),
  buildings: z.array(
    z.object({
      kind: z.literal("hub"),
      x: z.number().int(),
      y: z.number().int(),
      active: z.boolean(),
    }),
  ),
});

export const plannerPlanSchema = z.object({
  priority: resourceKindSchema,
  buildHub: z
    .object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
    })
    .nullable()
    .optional()
    .default(null),
});

export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;
export type PlannerPlan = z.infer<typeof plannerPlanSchema>;
