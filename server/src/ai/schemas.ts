import { z } from "zod";

export const resourceKindSchema = z.enum(["energy", "data", "alloy"]);
export const agentStatusSchema = z.enum(["idle", "moving", "gathering", "building"]);

export const worldSnapshotSchema = z.object({
  tick: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  epoch: z.number().int().positive(),
  stock: z.object({
    energy: z.number().int().nonnegative(),
    data: z.number().int().nonnegative(),
    alloy: z.number().int().nonnegative(),
  }),
  crisis: z.object({
    kind: z.enum(["none", "storm", "blackout", "virus"]),
    ticksLeft: z.number().int().nonnegative(),
  }),
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
