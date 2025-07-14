/**
 * Authentication utilities for managing authentication state
 * Now using cookie-based authentication instead of localStorage tokens
 */

// Store redirect path for after login
export const setRedirectPath = (path: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('redirectAfterLogin', path);
  } catch (err) {
    console.error('Error setting redirect path:', err);
  }
};

// Get redirect path for after login
export const getRedirectPath = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('redirectAfterLogin');
  } catch (err) {
    console.error('Error getting redirect path:', err);
    return null;
  }
};

// Clear redirect path
export const clearRedirectPath = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('redirectAfterLogin');
  } catch (err) {
    console.error('Error clearing redirect path:', err);
  }
};

// Legacy auth check (deprecated - use authService.isAuthenticated() instead)
export const isLoggedIn = (): boolean => {
  // For cookie-based auth, we can't reliably check authentication status from client-side
  // This is kept for backward compatibility but should not be used for real auth checks
  console.warn('isLoggedIn() is deprecated with cookie-based auth. Use authService.isAuthenticated() instead.');
  return false;
};

// Extract error message from any error
export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message;
    }
    
    if ('response' in error && 
        typeof (error as any).response === 'object' && 
        (error as any).response !== null) {
      const response = (error as any).response;
      
      if ('data' in response && typeof response.data === 'object' && response.data !== null) {
        if ('message' in response.data && typeof response.data.message === 'string') {
          return response.data.message;
        }
      }
      
      if ('status' in response && typeof response.status === 'number') {
        return `Error ${response.status}: Request failed`;
      }
    }
    
    return JSON.stringify(error);
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unknown error occurred';
};

// Handle auth errors consistently
export const handleAuthError = (error: unknown, router: any): void => {
  console.error('Authentication error:', error);
  
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    
    // Don't redirect to login if we're already there
    if (currentPath === '/auth/login') {
      console.log('Already on login page, not redirecting');
      return;
    }
    
    // Store the current path for redirect after login
    if (currentPath !== '/auth/login') {
      setRedirectPath(currentPath);
    }
    
    // Use window.location for a full page navigation
    window.location.href = '/auth/login';
  }
};