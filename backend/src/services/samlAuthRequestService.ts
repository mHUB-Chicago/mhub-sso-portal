import { PrismaClient, SamlAuthRequest, SamlBinding } from "@/database/models";
import { Context } from "hono";

export interface CreateSamlAuthRequestInput {
  serviceProviderId: string;
  inResponseTo: string;
  relayState?: string;
  acsUrl: string;
  requestBinding: SamlBinding;
  responseBinding: SamlBinding;
  expiresAt: Date;
}

export interface UpdateSamlAuthRequestInput {
  id: string;
  userId?: string;
  completedAt?: Date;
}

export const getSamlAuthRequestById = (c: Context, id: string): Promise<SamlAuthRequest | null> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.samlAuthRequest.findUnique({
    where: { id },
  });
}

export const createSamlAuthRequest = (c: Context, input: CreateSamlAuthRequestInput): Promise<SamlAuthRequest> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.samlAuthRequest.create({
    data: {
      serviceProviderId: input.serviceProviderId,
      userId: null,
      inResponseTo: input.inResponseTo,
      relayState: input.relayState,
      acsUrl: input.acsUrl,
      requestBinding: input.requestBinding,
      responseBinding: input.responseBinding,
      expiresAt: input.expiresAt,
    },
  });
}

export const updateSamlAuthRequest = (c: Context, input: UpdateSamlAuthRequestInput): Promise<SamlAuthRequest> => {
  const prisma: PrismaClient = c.get("db");
  return prisma.samlAuthRequest.update({
    where: { id: input.id },
    data: {
      userId: input.userId,
      completedAt: input.completedAt,
    },
  });
}
