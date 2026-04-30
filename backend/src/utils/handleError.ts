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
  console.error("Error occurred:", error);
  let message: string = "An internal error occurred";
  let status: ContentfulStatusCode = 500;
  if (error instanceof HTTPException) {
    message = error.message;
    status = error.status;
  } else if (error instanceof ZodError || error?.issues) {
    message = formatZodIssues(error.issues);
    status = 400;
  } else if (error instanceof Error) {
    // Expose the message only for expected application errors (4xx range).
    // For unexpected 500s, keep the generic message so internals don't leak.
    const clientSafeErrors = [
      "User not found",
      "Invalid request ID",
      "Login request has expired",
      "Login request already verified",
      "Too many attempts. Please request a new login.",
      "Invalid password",
      "User not authenticated",
      "Failed to change password",
      "Unauthorized",
    ];
    if (clientSafeErrors.includes(error.message)) {
      message = error.message;
    }
  }
  const response = FailedResponseSchema.parse({
    success: false,
    message: message,
  });
  return c.json(response, status);
};
