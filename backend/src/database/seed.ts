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
  await prisma.session.deleteMany();
  await prisma.samlAuthRequest.deleteMany();
  await prisma.userServiceProvider.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.serviceProvider.deleteMany();

  // Create service providers
  const peopleVineServiceProvider = await createServiceProvider(c, {
    name: "PeopleVine",
    entityId: "https://member.mhubchicago.com/",
    acsUrl: "https://member.mhubchicago.com/login/sso",
    nameIdFormat: "urn:clareity:safemls:nameid-format:loginid",
    nameIdSource: "email",
    signTarget: SamlSignTarget.ASSERTION,
  });

  const learnworldsServiceProvider = await createServiceProvider(c, {
    name: "LearnWorlds",
    entityId: "https://mhub.getlearnworlds.com/admin/api/saml/629643ac243d26e0ea4ed0ae/17663187076931/sp/metadata",
    acsUrl: "https://mhub.getlearnworlds.com/admin/api/saml/629643ac243d26e0ea4ed0ae/17663187076931/sp/saml2-acs",
    nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    nameIdSource: "email",
    signTarget: SamlSignTarget.ASSERTION,
  });

  // TODO: Add DigiFabster service provider once support team gets back to us
  // const digifabsterServiceProvider = await createServiceProvider(c, {
  //   name: "DigiFabster",
  //   entityId: "",
  //   acsUrl: "",
  //   nameIdFormat: "",
  //   nameIdSource: "email",
  //   signTarget: SamlSignTarget.ASSERTION,
  // });

  const mhubShopServiceProvider = await createServiceProvider(c, {
    name: "mHub Shop",
    entityId: "https://shop.mhubchicago.com/",
    acsUrl: "https://shop.mhubchicago.com/wp-login.php",
    nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    nameIdSource: "email",
    signTarget: SamlSignTarget.ASSERTION,
  });

  const company = await createCompany(c, {
    name: "Example Company",
    peopleVineId: "example-company-pvid",
    active: true,
  });

  const regularUser = await createUser(c, {
    name: "Test User",
    email: "axsmodern@gmail.com",
    password: "Example123!",
    role: Role.USER,
    companyId: company.id,
    peopleVineId: "test-user-pvid",
  });
};
export default app;