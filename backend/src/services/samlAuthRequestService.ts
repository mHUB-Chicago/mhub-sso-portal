import { PrismaClient, SamlBinding } from "@/database/models";
import { Context } from "hono";

export interface CreateSamlAuthRequestInput {
  serviceProviderId: string;
  userId: string;
  inResponseTo: string;
  relayState?: string;
  acsUrl: string;
  requestBinding: SamlBinding;
  responseBinding: SamlBinding;
  expiresAt: Date;
}

export interface UpdateSamlAuthRequestInput {
  id: string;
  completedAt: Date;
}

export const createSamlAuthRequest = (c: Context, input: CreateSamlAuthRequestInput) => {
  const prisma: PrismaClient = c.get("db");
  return prisma.samlAuthRequest.create({
    data: {
      serviceProviderId: input.serviceProviderId,
      userId: input.userId,
      inResponseTo: input.inResponseTo,
      relayState: input.relayState,
      acsUrl: input.acsUrl,
      requestBinding: input.requestBinding,
      responseBinding: input.responseBinding,
      expiresAt: input.expiresAt,
    },
  });
}