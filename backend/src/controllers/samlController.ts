import { Context } from "hono";
import { AppType, QueryInput } from "..";
import { SamlContinueRequestSchema, SamlRequestSchema } from "@common/schemas/saml";
import { createSamlAuthRequest, getSamlAuthRequestById, updateSamlAuthRequest } from "@/services/samlAuthRequestService";
import { PrismaClient, SamlBinding, ServiceProvider, User } from "@/database/models";
import { buildIdpMetadataXml, decodeSamlRequestParam, issueSamlResponse, parseSamlRequestXml } from "@/utils/saml";
import { getServiceProviderByEntityId, getServiceProviderById } from "@/services/serviceProviderService";
import { getSessionId, verifySession } from "@/middleware/auth";
import { getAllowedServiceProvidersForUser } from "@/services/userServiceProviderService";
import { PEOPLEVINE_SP_ENTITY_ID } from "@/controllers/onboardingController";

// A pending_membership user's own PV customer (new_company: a standalone registration;
// existing_company fallback: best-effort customer_reference only) never has a real
// membership/subscription attached yet — only the parent Company's PV customer does (see
// pushOnboardingSubmissionToPeopleVine, peopleVinePortalService.ts). Logging such a user
// into PV's member portal as themselves 502s there, since PV finds no membership for
// them. So while accountStatus is "pending_membership", SSO into PV specifically asserts
// the parent Company's identity instead — every other Service Provider (Digifaster,
// LearnWorlds, mHub Shop) still gets the user's own identity.
const resolveSamlIdentityEmail = async (
  c: Context<AppType>,
  user: User,
  serviceProvider: ServiceProvider
): Promise<string> => {
  if (serviceProvider.entityId !== PEOPLEVINE_SP_ENTITY_ID || user.accountStatus !== "pending_membership") {
    return user.email;
  }
  const prisma: PrismaClient = c.get("db");
  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  return company?.peopleVineId ? company.email : user.email;
};

export const handleSamlRequest = async (c: Context<AppType, string, QueryInput<typeof SamlRequestSchema>>) => {
  const { SAMLRequest: samlRequest, RelayState: relayState } = c.req.valid("query");
  const xml = decodeSamlRequestParam(samlRequest);
  const parsedRequest = parseSamlRequestXml(xml);
  const serviceProvider = await getServiceProviderByEntityId(c, parsedRequest.issuer);

  if (!serviceProvider) {
    return c.json({ message: "Unknown Service Provider" }, 400);
  }
  if (!serviceProvider.active) {
    return c.json({ message: "Service Provider is not active" }, 403);
  }
  if (parsedRequest.assertionConsumerServiceURL !== serviceProvider.acsUrl) {
    return c.json({ message: "Invalid ACS URL" }, 400);
  }

  let samlAuthRequest;
  try {
    samlAuthRequest = await createSamlAuthRequest(c, {
      serviceProviderId: serviceProvider.id,
      inResponseTo: parsedRequest.id,
      acsUrl: parsedRequest.assertionConsumerServiceURL,
      requestBinding: SamlBinding.HTTP_REDIRECT,
      responseBinding: SamlBinding.HTTP_POST,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Expires in 5 minutes
    });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint failed')) {
      return c.json({ message: "Duplicate SAML request" }, 400);
    }
    throw err;
  }
  const currentUser = await verifySession(c);
  const sessionId = getSessionId(c);
  if (currentUser && sessionId) {
    const allowedServiceProviders = await getAllowedServiceProvidersForUser(c, currentUser.id);
    const isAllowed = allowedServiceProviders.find(sp => sp.id === serviceProvider.id);
    if (!isAllowed) {
      return c.json({ message: "Access to Service Provider not authorized" }, 403);
    }
    // Issue SAML response
    const { html } = await issueSamlResponse({
      serviceProvider,
      samlRequest: samlAuthRequest,
      user: currentUser,
      sessionId,
      relayState,
      identityEmail: await resolveSamlIdentityEmail(c, currentUser, serviceProvider),
      idp: {
        entityId: c.env.SAML_ENTITY_ID as string,
        certPem: c.env.SAML_PUBLIC_CERT as string,
        privateKeyPkcs8Pem: c.env.SAML_PRIVATE_KEY as string,
      }
    });
    await updateSamlAuthRequest(c, { id: samlAuthRequest.id, completedAt: new Date() });
    return c.html(html);
  } else {
    // Redirect to frontend login with SAML Auth Request ID
    const queryParams = new URLSearchParams();
    queryParams.append("tx", samlAuthRequest.id);
    const redirectUrl = new URL(`${c.env.FRONTEND_URL}/login`);
    redirectUrl.search = queryParams.toString();
    return c.redirect(redirectUrl.toString());
  }
}

export const handleSamlContinueRequest = async (c: Context<AppType, string, QueryInput<typeof SamlContinueRequestSchema>>) => {
  const { tx } = c.req.valid("query");
  const samlAuthRequest = await getSamlAuthRequestById(c, tx);
  if (!samlAuthRequest) {
    return c.json({ message: "Invalid SAML transaction" }, 400);
  }
  const currentUser = await verifySession(c);
  const sessionId = getSessionId(c);
  if (!currentUser || !sessionId) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const serviceProvider = await getServiceProviderById(c, samlAuthRequest.serviceProviderId);
  if (!serviceProvider) {
    return c.json({ message: "Unknown Service Provider" }, 400);
  }
  if (!serviceProvider.active) {
    return c.json({ message: "Service Provider is not active" }, 403);
  }
  const allowedServiceProviders = await getAllowedServiceProvidersForUser(c, currentUser.id);
  const isAllowed = allowedServiceProviders.find(sp => sp.id === serviceProvider.id);
  if (!isAllowed) {
    return c.json({ message: "Access to Service Provider not authorized" }, 403);
  }
  // Issue SAML response
  const { html } = await issueSamlResponse({
    serviceProvider,
    samlRequest: samlAuthRequest,
    user: currentUser,
    relayState: samlAuthRequest.relayState || undefined,
    sessionId,
    identityEmail: await resolveSamlIdentityEmail(c, currentUser, serviceProvider),
    idp: {
      entityId: c.env.SAML_ENTITY_ID as string,
      certPem: c.env.SAML_PUBLIC_CERT as string,
      privateKeyPkcs8Pem: c.env.SAML_PRIVATE_KEY as string,
    }
  });
  await updateSamlAuthRequest(c, { id: samlAuthRequest.id, completedAt: new Date() });
  return c.html(html);
}

export const handleSamlMetadata = async (c: Context<AppType>) => {
  const samlMetadataXml = buildIdpMetadataXml({
    entityId: c.env.SAML_ENTITY_ID as string,
    ssoRedirectUrl: `${c.env.BACKEND_URL}/saml`,
    signingCertPem: c.env.SAML_PUBLIC_CERT as string,
  });
  return c.html(samlMetadataXml, 200, {
    "Content-Type": "application/xml",
  });
};

export const handleIdpInitiatedSso = async (c: Context<AppType>) => {
  const serviceProviderId = c.req.param("serviceProviderId");
  const relayState = c.req.query("relayState");
  if (!serviceProviderId) {
    return c.json({ message: "Missing service provider ID" }, 400);
  }

  const currentUser = await verifySession(c);
  const sessionId = getSessionId(c);
  if (!currentUser || !sessionId) {
    const loginUrl = new URL(`${c.env.FRONTEND_URL}/login`);
    const retryUrl = new URL(`${c.env.BACKEND_URL}/saml/sso/${serviceProviderId}`);
    if (relayState) retryUrl.searchParams.set('relayState', relayState);
    loginUrl.searchParams.set('returnTo', retryUrl.toString());
    return c.redirect(loginUrl.toString());
  }

  const serviceProvider = await getServiceProviderById(c, serviceProviderId);
  if (!serviceProvider) {
    return c.json({ message: "Unknown Service Provider" }, 400);
  }
  if (!serviceProvider.active) {
    return c.json({ message: "Service Provider is not active" }, 403);
  }

  const allowedServiceProviders = await getAllowedServiceProvidersForUser(c, currentUser.id);
  const isAllowed = allowedServiceProviders.find(sp => sp.id === serviceProvider.id);
  if (!isAllowed) {
    return c.json({ message: "Access to Service Provider not authorized" }, 403);
  }

  const { html } = await issueSamlResponse({
    serviceProvider,
    samlRequest: null,
    user: currentUser,
    sessionId,
    relayState,
    identityEmail: await resolveSamlIdentityEmail(c, currentUser, serviceProvider),
    idp: {
      entityId: c.env.SAML_ENTITY_ID as string,
      certPem: c.env.SAML_PUBLIC_CERT as string,
      privateKeyPkcs8Pem: c.env.SAML_PRIVATE_KEY as string,
    },
  });
  return c.html(html);
};