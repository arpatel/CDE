// RFC 7807 Problem Details — the standard error envelope from the API spec (§3.5).

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }

  static badRequest(detail: string, code = "VALIDATION_ERROR") {
    return new ApiError(400, code, detail);
  }
  static unauthorized(detail = "Missing or invalid bearer token") {
    return new ApiError(401, "UNAUTHORIZED", detail);
  }
  static forbidden(detail = "Caller lacks required permission") {
    return new ApiError(403, "FORBIDDEN", detail);
  }
  static notFound(detail = "Resource does not exist or is not accessible") {
    return new ApiError(404, "NOT_FOUND", detail);
  }
  static conflict(detail: string) {
    return new ApiError(409, "CONFLICT", detail);
  }
  static unprocessable(detail: string) {
    return new ApiError(422, "UNPROCESSABLE", detail);
  }
}

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

export function toProblemDetails(err: ApiError, instance: string) {
  return {
    type: "about:blank",
    title: TITLES[err.status] ?? "Error",
    status: err.status,
    code: err.code,
    detail: err.detail,
    instance,
  };
}
