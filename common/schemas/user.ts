import z from "zod";
import { SuccessResponseSchema } from "./response";

export const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  emailVerified: z.boolean(),
  mustResetPassword: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const GetMyUserResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
}));