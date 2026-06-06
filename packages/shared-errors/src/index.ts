import type { ErrorEnvelope } from "@doc-ai/api-contracts";

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 500,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function toErrorEnvelope(error: unknown, requestId?: string): ErrorEnvelope {
  if (error instanceof ServiceError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId
      }
    };
  }

  if (error instanceof Error) {
    return {
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
        requestId
      }
    };
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected service error",
      details: error,
      requestId
    }
  };
}

export function errorStatus(error: unknown): number {
  return error instanceof ServiceError ? error.statusCode : 500;
}
