import { z } from "zod";
import type { FailedResponse } from "../../../common/schemas/response";
import { FailedResponseSchema } from "../../../common/schemas/response";

export type APIResponse<T> = {
  data?: T;
  error?: FailedResponse;
};

export async function apiFetch(
  path: string,
  options: RequestInit,
  responseSchema: z.ZodSchema
): Promise<APIResponse<z.infer<typeof responseSchema>>> {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const apiBasePath = import.meta.env.VITE_API_BASE_PATH ?? "/api";
  if (!apiBaseUrl || !apiBasePath) {
    throw new Error("API configuration environment variables are missing");
  }
  const apiUrl = `${apiBaseUrl}${apiBasePath}/${path}`;
  const authToken = localStorage.getItem("authToken");
  const res = await fetch(apiUrl, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  const json = await res.json();
  if (authToken && res.status === 401) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    throw new Error("Session expired. Please log in again");
  }

  let successResponse;
  let failedResponse;

  if (res.ok) {
    successResponse = responseSchema.safeParse(json);
  } else {
    failedResponse = FailedResponseSchema.safeParse(json);
  }

  if (successResponse && !successResponse.success) {
    throw new Error("Invalid response format");
  }
  if (failedResponse && !failedResponse.success) {
    throw new Error("Invalid error format");
  }

  return {
    data: successResponse?.data,
    error: failedResponse?.data,
  };
}

//For multipart/form-data requests
export async function apiUpload(
  path: string,
  options: RequestInit,
  responseSchema: z.ZodSchema
): Promise<APIResponse<z.infer<typeof responseSchema>>> {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const apiBasePath = import.meta.env.VITE_API_BASE_PATH ?? "/api";
  if (!apiBaseUrl || !apiBasePath) {
    throw new Error("API configuration environment variables are missing");
  }
  const apiUrl = `${apiBaseUrl}${apiBasePath}/${path}`;
  const authToken = localStorage.getItem("authToken");
  const res = await fetch(apiUrl, {
    ...options,
    credentials: "include",
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  const json = await res.json();

  let successResponse;
  let failedResponse;

  if (res.ok) {
    successResponse = responseSchema.safeParse(json);
  } else {
    failedResponse = FailedResponseSchema.safeParse(json);
  }

  if (successResponse && !successResponse.success) {
    throw new Error("Invalid response format");
  }
  if (failedResponse && !failedResponse.success) {
    throw new Error("Invalid error format");
  }

  return {
    data: successResponse?.data,
    error: failedResponse?.data,
  };
}

export async function downloadFile(path: string, options: RequestInit): Promise<any> {
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  const apiBasePath = import.meta.env.VITE_API_BASE_PATH ?? "/api";
  if (!apiBaseUrl || !apiBasePath) {
    throw new Error("API configuration environment variables are missing");
  }
  const apiUrl = `${apiBaseUrl}${apiBasePath}/${path}`;
  const authToken = localStorage.getItem("authToken");
  const res = await fetch(apiUrl, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  return res;
}