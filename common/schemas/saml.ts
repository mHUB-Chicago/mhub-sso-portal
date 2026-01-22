import { z } from "zod";

export const SamlRequestSchema = z.object({
  SAMLRequest: z.string(),
  RelayState: z.string().optional(),
});

export const SamlContinueRequestSchema = z.object({
  tx: z.string(),
});