import { Hono } from "hono";
import z from "zod";
import { AppType } from "@/index";
import { validate } from "@/middleware/validate";
import { describeRoute } from "@/utils/describeRoute";
import { handleSamlContinueRequest, handleSamlMetadata, handleSamlRequest } from "@/controllers/samlController";
import { SamlContinueRequestSchema, SamlRequestSchema } from "@common/schemas/saml";

const app = new Hono<AppType>();

app.get(
  "/",
  describeRoute({
    summary: "Initiate SAML login",
    successMessage: "SAML request processed successfully"
  }),
  validate(SamlRequestSchema, "query"),
  handleSamlRequest
);

app.get(
  "/continue",
  describeRoute({
    summary: "Continue SAML login after authentication",
    successMessage: "SAML response issued successfully",
  }),
  validate(SamlContinueRequestSchema, "query"),
  handleSamlContinueRequest
);

app.get(
  "/metadata",
  describeRoute({
    summary: "Get IdP SAML metadata",
    successMessage: "SAML metadata retrieved successfully",
  }),
  handleSamlMetadata
);

export default app;
