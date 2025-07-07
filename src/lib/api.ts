import axios from 'axios';
import { setRedirectPath } from './auth-utils';
import { isProtectedRoute } from './routes';

// Create an axios instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  // Enable sending cookies with requests
  withCredentials: true,
});

// Add a response interceptor for handling auth errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Only handle auth errors if we're in a browser environment
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      console.warn('Authentication error detected:', error.response.data);
      
      // Get current path
      const currentPath = window.location.pathname;
      
      // Skip redirect if already on login page or if it's a public route
      if (currentPath.startsWith('/auth/login') || !isProtectedRoute(currentPath)) {
        console.log('On login page or public route, not redirecting');
        return Promise.reject(error);
      }

      // Store the intended destination for redirect after login
      setRedirectPath(currentPath);
      
      // Use window.location for a full page reload to ensure clean state
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

export default api;
