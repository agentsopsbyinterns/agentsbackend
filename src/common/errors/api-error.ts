export class ApiError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, message, details);
}
export function unauthorized(message = 'Unauthorized') {
  return new ApiError(401, message);
}
export function forbidden(message = 'Forbidden') {
  return new ApiError(403, message);
}
export function notFound(message = 'Not found') {
  return new ApiError(404, message);
}
export function conflict(message = 'Conflict') {
  return new ApiError(409, message);
}
export function serverError(message = 'Internal server error') {
  return new ApiError(500, message);
}
