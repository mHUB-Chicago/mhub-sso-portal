import { Context } from "hono";
import { AppType, QueryInput } from "..";
import { SamlContinueRequestSchema, SamlRequestSchema } from "@common/schemas/saml";
import { createSamlAuthRequest, getSamlAuthRequestById } from "@/services/samlAuthRequestService";
import { SamlBinding } from "@/database/models";
import { decodeSamlRequestParam, issueSamlResponse, parseSamlRequestXml } from "@/utils/saml";
import { getServiceProviderByEntityId, getServiceProviderById } from "@/services/serviceProviderService";
import { getSessionId, verifySession } from "@/middleware/auth";
import { getUserServiceProvider } from "@/services/userServiceProviderService";

interface IssueSamlResponseInput {
  serviceProviderId: string;
  inResponseTo: string;
  userId: string;
  relayState?: string;
}

export const handleSamlRequest = async (c: Context<AppType, string, QueryInput<typeof SamlRequestSchema>>) => {
  const { SAMLRequest: samlRequest, RelayState: relayState } = c.req.valid("query");
  const xml = decodeSamlRequestParam(samlRequest);
  const parsedRequest = parseSamlRequestXml(xml);
  const serviceProvider = await getServiceProviderByEntityId(c, parsedRequest.issuer);

  if (!serviceProvider) {
    return c.json({ message: "Unknown Service Provider" }, 400);
  }
  if (parsedRequest.assertionConsumerServiceURL !== serviceProvider.acsUrl) {
    return c.json({ message: "Invalid ACS URL" }, 400);
  }

  const samlAuthRequest = await createSamlAuthRequest(c, {
    serviceProviderId: serviceProvider.id,
    inResponseTo: parsedRequest.id,
    acsUrl: parsedRequest.assertionConsumerServiceURL,
    requestBinding: SamlBinding.HTTP_REDIRECT,
    responseBinding: SamlBinding.HTTP_POST,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Expires in 5 minutes
  });
  const currentUser = await verifySession(c);
  const sessionId = getSessionId(c);
  if (currentUser && sessionId) {
    const userServiceProvider = await getUserServiceProvider(c, currentUser.id, serviceProvider.id);
    if (!userServiceProvider) {
      return c.json({ message: "Access to Service Provider not authorized" }, 403);
    }
    // Issue SAML response
    const { html } = await issueSamlResponse({
      serviceProvider,
      samlRequest: samlAuthRequest,
      user: currentUser,
      sessionId,
      relayState,
      idp: {
        entityId: "https://sso.mhubchicago.com/",
        certPem: c.env.SAML_PUBLIC_CERT as string,
        privateKeyPkcs8Pem: c.env.SAML_PRIVATE_KEY as string,
      }
    });
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
  const userServiceProvider = await getUserServiceProvider(c, currentUser.id, serviceProvider.id);
  if (!userServiceProvider) {
    return c.json({ message: "Access to Service Provider not authorized" }, 403);
  }
  // Issue SAML response
  const { html } = await issueSamlResponse({
    serviceProvider,
    samlRequest: samlAuthRequest,
    user: currentUser,
    relayState: samlAuthRequest.relayState || undefined,
    sessionId,
    idp: {
      entityId: "https://sso.mhubchicago.com/",
      certPem: c.env.SAML_PUBLIC_CERT as string,
      privateKeyPkcs8Pem: c.env.SAML_PRIVATE_KEY as string,
    }
  });
  return c.html(html);
}