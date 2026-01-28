import z from "zod";
import { describeRoute as honoDescribeRoute } from "hono-openapi";
import { resolver } from "hono-openapi";
import type { OpenAPIV3 } from "openapi-types";
import { FailedResponseSchema } from "@common/schemas/response";

interface DescribeRouteOptions {
  summary: string;
  description?: string;
  successMessage?: string;
  parameters?: (OpenAPIV3.ParameterObject | OpenAPIV3.ParameterObject)[];
  responseSchema?: z.ZodType<any>;
}

export const describeRoute = (options: DescribeRouteOptions) => {
  const { summary, successMessage, responseSchema, parameters, description } = options;
  const currentParameters = parameters ?? [];
  const successResponse = {
    description: successMessage ?? "Success",
    ...(responseSchema !== undefined ? {
      content: {
        "application/json": {
          schema: resolver(responseSchema),
        }
      }
    } : {})
  };
  const failedResponses = {
    400: {
      description: "Bad Request",
      content: {
        "application/json": {
          schema: resolver(FailedResponseSchema),
        }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: resolver(FailedResponseSchema),
        }
      }
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: resolver(FailedResponseSchema),
        }
      }
    },
    404: {
      description: "Not Found",
      content: {
        "application/json": {
          schema: resolver(FailedResponseSchema),
        }
      }
    },
    500: {
      description: "Internal Server Error",
      content: {
        "application/json": {
          schema: resolver(FailedResponseSchema),
        }
      }
    }
  };
  return honoDescribeRoute({
    summary,
    description: description ?? undefined,
    parameters: currentParameters,
    responses: {
      200: successResponse,
      ...failedResponses,
    },
  });
};