import { z, ZodType } from "zod";

export const SuccessResponseSchema = <T extends ZodType>(dataSchema?: T) =>
  z.object({
    success: z.boolean(),
    message: z.string().optional(),
    data: dataSchema ? dataSchema : z.any().optional(),
  });

export const FailedResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  // Machine-readable reason, for callers that react to a specific failure
  // (e.g. the login page restarting an expired login instead of just toasting it).
  code: z.string().optional(),
});
export type FailedResponse = z.infer<typeof FailedResponseSchema>;
