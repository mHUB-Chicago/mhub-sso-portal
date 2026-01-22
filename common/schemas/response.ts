import { z, ZodType } from "zod";

export const SuccessResponseSchema = <T extends ZodType>(dataSchema?: T) =>
  z.object({
    success: z.boolean(),
    message: z.string().optional(),
    data: dataSchema ? dataSchema : z.undefined().or(z.null()),
  });

export const FailedResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type FailedResponse = z.infer<typeof FailedResponseSchema>;
