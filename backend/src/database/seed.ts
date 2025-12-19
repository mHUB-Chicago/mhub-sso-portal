import { PrismaClient, Role, SamlSignTarget } from "@prisma/client";
import { Context } from "hono";
import { Hono } from "hono";
import { AppType } from "@/index";
import { databaseMiddleware } from "@/middleware/database";
import { createCompany } from "@/services/companyService";
import { createUser } from "@/services/userService";
import { createServiceProvider } from "@/services/serviceProviderService";

const app = new Hono<AppType>();

app.post(
  "/",
  databaseMiddleware,
  async (c) => {
    if (c.env.SEED_ENABLED !== "true") {
      return c.json({ success: false }, 403);
    }
    const auth = c.req.header("authorization") ?? "";
    if (auth !== `Bearer ${c.env.SEED_TOKEN}`) {
      return c.json({ success: false }, 401);
    }
    await runSeed(c);
    return c.json({ success: true });
  }
);

export const runSeed = async (c: Context) => {
  const prisma: PrismaClient = c.get("db");

  // Clear existing data
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.userServiceProvider.deleteMany();
  await prisma.samlAuthRequest.deleteMany();

  // Create service providers
  const peopleVineServiceProvider = await createServiceProvider(c, {
    name: "PeopleVine",
    entityId: "https://member.mhubchicago.com/",
    acsUrl: "https://member.mhubchicago.com/login/sso",
    nameIdFormat: "urn:clareity:safemls:nameid-format:loginid",
    nameIdSource: "email",
    signTarget: SamlSignTarget.ASSERTION,
  });

  const company = await createCompany(c, {
    name: "Example Company",
    peopleVineId: "example-company-pvid",
    active: true,
  });

  const adminUser = await createUser(c, {
    name: "Admin User",
    email: "mike+admin@breezydev.com",
    role: Role.ADMIN,
    companyId: company.id,
    peopleVineId: "admin-user-pvid",
  });

  const regularUser = await createUser(c, {
    name: "Test User",
    email: "mike@breezydev.com",
    role: Role.USER,
    companyId: company.id,
    peopleVineId: "test-user-pvid",
  });

  console.log(`Created service provider with entity ID: ${peopleVineServiceProvider.entityId}`);
  console.log(`Created company with name: ${company.name}`);
  console.log(`Created admin user with email: ${adminUser.email}`);
  console.log(`Created regular user with email: ${regularUser.email}`);
};
export default app;