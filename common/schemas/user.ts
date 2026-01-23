import z from "zod";
import { SuccessResponseSchema } from "./response";

export const UserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  emailVerified: z.boolean(),
  mustResetPassword: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const AppSchema = z.object({
  name: z.string(),
  logo: z.string(),
  url: z.string(),
});

export const GetMyUserResponseSchema = SuccessResponseSchema(z.object({
  user: UserSchema,
  apps: z.array(AppSchema)
}));