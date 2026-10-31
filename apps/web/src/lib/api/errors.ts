// The API answers every error in one shape: { statusCode, error, message, ... } where `message`
// is a string or, for validation errors, a list of strings.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((m): m is string => typeof m === 'string')) {
      return message.join('. ');
    }
  }
  return fallback;
}

// Text that is safe to show to a person, whatever was thrown.
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  return error instanceof ApiError ? error.message : fallback;
}
