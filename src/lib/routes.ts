/**
 * Route configuration for the application
 */

// Routes that don't require authentication
export const publicRoutes = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
];

// Routes that require authentication
export const protectedRoutes = [
  '/app',
  '/app/chat',
  '/app/files',
  '/app/settings',
];

/**
 * Check if a route is public (doesn't require authentication)
 */
export const isPublicRoute = (path: string): boolean => {
  // Always consider the root path public
  if (path === '/') return true;
  
  // Check exact matches
  if (publicRoutes.includes(path)) {
    return true;
  }
  
  // Check if path starts with any public route prefix
  return publicRoutes.some(route => 
    path.startsWith(route) && (
      route === path || 
      path.charAt(route.length) === '/' || 
      path.charAt(route.length) === '?'
    )
  );
};

/**
 * Check if a route is protected (requires authentication)
 */
export const isProtectedRoute = (path: string): boolean => {
  // Don't consider public routes as protected
  if (isPublicRoute(path)) {
    return false;
  }
  
  // Check exact matches
  if (protectedRoutes.includes(path)) {
    return true;
  }
  
  // Check if path starts with any protected route prefix
  return protectedRoutes.some(route => 
    path.startsWith(route) && (
      route === path || 
      path.charAt(route.length) === '/' || 
      path.charAt(route.length) === '?'
    )
  );
};
