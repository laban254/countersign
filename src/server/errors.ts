/**
 * Typed application errors. Routes can map these to stable HTTP status codes
 * and machine-readable error codes without leaking internal messages.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, code, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, code, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', code = 'NOT_FOUND') {
    super(message, code, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, code, 409);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'INVALID_REQUEST') {
    super(message, code, 400);
    this.name = 'ValidationError';
  }
}

export class IdempotencyConflictError extends ConflictError {
  constructor(message = 'The idempotency key was already used with a different request payload.') {
    super(message, 'IDEMPOTENCY_KEY_REUSED');
    this.name = 'IdempotencyConflictError';
  }
}

export class RevalidationError extends ConflictError {
  constructor(message: string, code = 'REVALIDATION_FAILED') {
    super(message, code);
    this.name = 'RevalidationError';
  }
}
