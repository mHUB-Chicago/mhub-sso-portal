import { Context } from "hono";
import { ZodError } from "zod";
import { HTTPException } from "hono/http-exception";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { FailedResponseSchema } from "@common/schemas/response";

const formatZodIssues = (issues: any) => {
  return issues.map((issue: any) => {
    const { path, message } = issue;
    return `${path.join(".")} - ${message}`;
  }).join(", ");
};

export const handleError = (error: any, c: Context) => {
  let message: string = "An unknown error occurred";
  let status: ContentfulStatusCode = 500;
  if (error instanceof HTTPException) {
    message = error.message;
    status = error.status;
  } else if (error instanceof ZodError || error?.issues) {
    message = formatZodIssues(error.issues);
    status = 400;
  } else if (error instanceof Error) {
    message = error?.message || message;
  } else if (typeof error === "string") {
    message = error;
  }
  const response = FailedResponseSchema.parse({
    success: false,
    message: message,
  });
  return c.json(response, status);
};
