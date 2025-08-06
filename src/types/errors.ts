/**
 * Types and utilities for standardized error handling
 */

export interface ApiErrorResponse {
  message: string;
  statusCode?: number;
  error?: string;
}

// Type guard to check if an object is an ApiErrorResponse
export function isApiErrorResponse(error: unknown): error is ApiErrorResponse {
  return (
    typeof error === 'object' && 
    error !== null &&
    'message' in error && 
    typeof (error as { message: unknown }).message === 'string'
  );
}

// Type guard to check if an object is an Error instance
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// Type guard to check if an object has response property with data
export function hasErrorResponse(error: unknown): error is { response: { data?: unknown, status?: number } } {
  return (
    typeof error === 'object' && 
    error !== null && 
    'response' in error && 
    typeof (error as { response: unknown }).response === 'object' &&
    (error as { response: unknown }).response !== null
  );
}

// Extract error message safely from any error type
export function extractErrorMessage(error: unknown): string {
  // Handle Error instances
  if (isError(error)) {
    return error.message;
  }

  // Handle API error responses
  if (isApiErrorResponse(error)) {
    return error.message;
  }

  // Handle Axios-like errors with response.data
  if (hasErrorResponse(error)) {
    const responseData = error.response.data;
    if (isApiErrorResponse(responseData)) {
      return responseData.message;
    }
    if (typeof responseData === 'string') {
      return responseData;
    }
    // If response has status code, include it in the message
    const status = error.response.status;
    if (status) {
      return `Error ${status}: Request failed`;
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Default error message
  return 'An unknown error occurred';
}

// Check if the error is an authentication error
export function isAuthError(error: unknown): boolean {
  // Check for status code 401
  if (hasErrorResponse(error) && error.response.status === 401) {
    return true;
  }

  // Check for auth-related error messages
  const errorMsg = extractErrorMessage(error).toLowerCase();
  return (
    errorMsg.includes('unauthorized') ||
    errorMsg.includes('authentication') ||
    errorMsg.includes('token') ||
    errorMsg.includes('login') ||
    errorMsg.includes('session expired') ||
    errorMsg.includes('not authenticated')
  );
}

// Redirect path for authentication errors
export function getAuthRedirectPath(): string {
  return '/auth/login';
}
