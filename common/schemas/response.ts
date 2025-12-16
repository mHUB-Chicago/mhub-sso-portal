import { z, ZodTypeAny } from "zod";

export const SuccessResponseSchema = <T extends ZodTypeAny>(dataSchema?: T) =>
  z.object({
    success: z.boolean(),
    message: z.string().optional(),
    data: dataSchema ? dataSchema : z.null(),
  });

export const FailedResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type FailedResponse = z.infer<typeof FailedResponseSchema>;
