import xpath from "xpath";
import { SamlAuthRequest, SamlSignTarget, ServiceProvider, Session, User } from "@/database/models";
import { inflateRaw } from "pako";
import * as xmldom from "@xmldom/xmldom";
import * as xmldsigjs from "xmldsigjs";
import { setNodeDependencies } from "xml-core";

export type ParsedSamlRequest = {
  id: string; // AuthnRequest/@ID
  version: string; // AuthnRequest/@Version
  issueInstant: string; // AuthnRequest/@IssueInstant (ISO)
  protocolBinding?: string; // AuthnRequest/@ProtocolBinding
  assertionConsumerServiceURL?: string; // AuthnRequest/@AssertionConsumerServiceURL
  destination?: string; // AuthnRequest/@Destination (optional)
  issuer: string; // saml:Issuer text
  nameIdFormat?: string; // samlp:NameIDPolicy/@Format (optional)
};

const textOrUndefined = (n: any): string | undefined => {
  if (!n) return undefined;
  const v = typeof n === "string" ? n : n?.textContent;
  const s = (v ?? "").toString().trim();
  return s.length ? s : undefined;
};

const attrOrUndefined = (n: Node | undefined | null, attr: string): string | undefined => {
  if (!n) return undefined;
  const el = n as unknown as Element;
  const v = el.getAttribute?.(attr);
  const s = (v ?? "").trim();
  return s.length ? s : undefined;
};

export const parseSamlRequestXml = (xml: string): ParsedSamlRequest => {
  const doc = new xmldom.DOMParser({
    errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
  }).parseFromString(xml, "text/xml");

  // Root AuthnRequest (namespace-agnostic)
  const authnRequest = xpath.select1("/*[local-name()='AuthnRequest']", doc) as Node | undefined;
  if (!authnRequest) {
    throw new Error("Invalid SAMLRequest XML: missing AuthnRequest root element");
  }

  const id = attrOrUndefined(authnRequest, "ID");
  const version = attrOrUndefined(authnRequest, "Version") ?? "2.0";
  const issueInstant = attrOrUndefined(authnRequest, "IssueInstant");
  const protocolBinding = attrOrUndefined(authnRequest, "ProtocolBinding");
  const assertionConsumerServiceURL = attrOrUndefined(authnRequest, "AssertionConsumerServiceURL");
  const destination = attrOrUndefined(authnRequest, "Destination");

  // Issuer element (namespace-agnostic). Usually: /AuthnRequest/saml:Issuer
  const issuerNode = xpath.select1(
    "/*[local-name()='AuthnRequest']/*[local-name()='Issuer']",
    doc
  ) as Node | undefined;
  const issuer = textOrUndefined(issuerNode);

  // NameIDPolicy (optional) - grab Format attribute
  const nameIdPolicyNode = xpath.select1(
    "/*[local-name()='AuthnRequest']/*[local-name()='NameIDPolicy']",
    doc
  ) as Node | undefined;
  const nameIdFormat = attrOrUndefined(nameIdPolicyNode, "Format");

  if (!id) throw new Error("Invalid SAMLRequest XML: AuthnRequest missing ID attribute");
  if (!issueInstant) throw new Error("Invalid SAMLRequest XML: AuthnRequest missing IssueInstant");
  if (!issuer) throw new Error("Invalid SAMLRequest XML: missing Issuer element/text");

  return {
    id,
    version,
    issueInstant,
    protocolBinding,
    assertionConsumerServiceURL,
    destination,
    issuer,
    nameIdFormat,
  };
};

export const decodeSamlRequestParam = (samlRequest: string): string => {
  const decoded = decodeURIComponent(samlRequest);
  const bin = atob(decoded);
  const decodedBytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  let xmlBytes: Uint8Array = inflateRaw(decodedBytes);
  return new TextDecoder("utf-8").decode(xmlBytes);
}

export type IssueSamlResponseInput = {
  serviceProvider: ServiceProvider,
  samlRequest: SamlAuthRequest;
  user: User,
  sessionId: string,
  relayState?: string | null;
  idp: {
    entityId: string;
    certPem: string;
    privateKeyPkcs8Pem: string;
  };
};

function stripPem(pem: string): string {
  return pem.replace(/-----(BEGIN|END)[^-----]+-----/g, "").replace(/\s+/g, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = stripPem(pem);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function base64EncodeUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function chooseNameId(user: User, source: string): string {
  // only "email" supported for now
  return user.email;
}

function buildUnsignedSamlResponseXml(input: IssueSamlResponseInput) {
  const { user, serviceProvider, samlRequest } = input;
  const now = new Date();
  const notOnOrAfter = addMinutes(now, 60).toISOString();
  const notBefore = now.toISOString();

  const responseId = `_${crypto.randomUUID()}`;
  const assertionId = `_${crypto.randomUUID()}`;
  const sessionIndex = `_${input.sessionId}`;

  const destination = serviceProvider.acsUrl;

  const nameIdValue = chooseNameId(user, serviceProvider.nameIdSource);
  const nameIdFormat = serviceProvider.nameIdFormat;
  const email = user.email;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${responseId}"
  InResponseTo="${samlRequest.inResponseTo}"
  Version="2.0"
  IssueInstant="${now.toISOString()}"
  Destination="${escapeHtmlAttr(destination)}"
>
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${input.idp.entityId}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion ID="${assertionId}" Version="2.0" IssueInstant="${now.toISOString()}">
    <saml:Issuer>${input.idp.entityId}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="${nameIdFormat}">${nameIdValue}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData
          InResponseTo="${samlRequest.inResponseTo}"
          NotOnOrAfter="${notOnOrAfter}"
          Recipient="${escapeHtmlAttr(destination)}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>

    <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
      <saml:AudienceRestriction>
        <saml:Audience>${input.serviceProvider.entityId}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>

    <saml:AuthnStatement AuthnInstant="${now.toISOString()}" SessionIndex="${sessionIndex}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>
          urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified
        </saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>

    <saml:AttributeStatement xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue xsi:type="xs:string">${email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue xsi:type="xs:string">${nameIdValue}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue xsi:type="xs:string">${email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue xsi:type="xs:string">${email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri">
        <saml:AttributeValue xsi:type="xs:string">${email}</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

  return { xml, responseId, assertionId, destination };
}

async function importPkcs8RsaPrivateKey(privateKeyPkcs8Pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPkcs8Pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function ensureXmldsigConfigured() {
  xmldsigjs.Application.setEngine("CloudflareWorkers", crypto as any);
  setNodeDependencies({
    DOMParser: xmldom.DOMParser,
    XMLSerializer: xmldom.XMLSerializer,
    Document: xmldom.DOMImplementation.prototype.createDocument().constructor,
  });
}

async function signXmlByReference(opts: {
  xml: string;
  referenceUri: string; // "#_ASSERTION_ID" or "#_RESPONSE_ID"
  privateKey: CryptoKey;
  certPem: string;
}) {
  ensureXmldsigConfigured();

  const doc = xmldsigjs.Parse(opts.xml);
  const signer = new xmldsigjs.SignedXml();

  await signer.Sign(
    { name: "RSASSA-PKCS1-v1_5" },
    opts.privateKey,
    doc,
    {
      x509: [stripPem(opts.certPem)],
      references: [
        {
          uri: opts.referenceUri,
          hash: "SHA-256",
          transforms: ["enveloped", "exc-c14n"],
        },
      ],
    }
  );

  const signedXml = signer.toString();
  // Move the Signature element to be the first child of the signed element
  const signedDoc = new xmldom.DOMParser().parseFromString(signedXml, "text/xml");
  const signatureNode = xpath.select1(
    "/*[local-name()='Response']/*[local-name()='Signature'] | /*[local-name()='Assertion']/*[local-name()='Signature']",
    signedDoc
  ) as Node | undefined;
  const referenceId = opts.referenceUri.substring(1); // strip leading #
  const referenceNode = xpath.select1(
    `//*[@ID='${referenceId}']`,
    signedDoc
  ) as Node | undefined;
  if (signatureNode && referenceNode) {
    // Remove signature from current position
    signatureNode.parentNode?.removeChild(signatureNode);
    // Insert as 2nd child of referenceNode (after the Issuer)
    referenceNode.insertBefore(signatureNode, referenceNode.childNodes[2]);
  }
  return new xmldom.XMLSerializer().serializeToString(signedDoc);
}

function buildHttpPostFormHtml(acsUrl: string, samlResponseXmlSigned: string, relayState?: string | null) {
  const samlResponseB64 = base64EncodeUtf8(samlResponseXmlSigned);

  const relayStateInput = relayState != null
    ? `<input type="hidden" name="RelayState" value="${escapeHtmlAttr(relayState)}" />`
    : "";

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>SSO Redirect</title></head>
  <body>
    <form method="post" action="${escapeHtmlAttr(acsUrl)}">
      <input type="hidden" name="SAMLResponse" value="${escapeHtmlAttr(samlResponseB64)}" />
      ${relayStateInput}
      <noscript><button type="submit">Continue</button></noscript>
    </form>
    <script>document.forms[0].submit();</script>
  </body>
</html>`;
}

export async function issueSamlResponse(input: IssueSamlResponseInput) {
  const { xml, responseId, assertionId, destination } = buildUnsignedSamlResponseXml(input);

  const privateKey = await importPkcs8RsaPrivateKey(input.idp.privateKeyPkcs8Pem);

  let signedXml = xml;

  if (input.serviceProvider.signTarget === SamlSignTarget.ASSERTION) {
    signedXml = await signXmlByReference({
      xml,
      referenceUri: `#${assertionId}`,
      privateKey,
      certPem: input.idp.certPem,
    });
  } else if (input.serviceProvider.signTarget === SamlSignTarget.RESPONSE) {
    signedXml = await signXmlByReference({
      xml,
      referenceUri: `#${responseId}`,
      privateKey,
      certPem: input.idp.certPem,
    });
  } else {
    const signedOnce = await signXmlByReference({
      xml,
      referenceUri: `#${assertionId}`,
      privateKey,
      certPem: input.idp.certPem,
    });
    signedXml = await signXmlByReference({
      xml: signedOnce,
      referenceUri: `#${responseId}`,
      privateKey,
      certPem: input.idp.certPem,
    });
  }

  const html = buildHttpPostFormHtml(destination, signedXml, input.relayState);

  return {
    acsUrl: destination,
    signedXml,
    html,
  };
}
