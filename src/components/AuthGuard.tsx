'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { setRedirectPath } from '../lib/auth-utils';
import { isPublicRoute } from '../lib/routes';
import { authService } from '../services/auth';
import Navbar from './Navbar';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if the route is public or if the user is authenticated
    const checkAuth = async () => {
      const publicRoute = isPublicRoute(pathname || '');
      
      console.log(`AuthGuard: Checking auth for path=${pathname}, isPublic=${publicRoute}`);
      
      // Allow public routes always (no auth check needed)
      if (publicRoute) {
        console.log(`AuthGuard: ${pathname} is public, allowing access`);
        setIsAuthorized(true);
        setIsLoading(false);
        return;
      }
      
      // For protected routes, check if logged in using cookie-based auth
      try {
        const isAuthenticated = await authService.isAuthenticated();
        console.log(`AuthGuard: Authentication check result: ${isAuthenticated}`);
        
        if (isAuthenticated) {
          setIsAuthorized(true);
        } else {
          // Save the current path for redirect after login
          console.log(`AuthGuard: Not authenticated, saving redirect path: ${pathname}`);
          setRedirectPath(pathname || '/app');
          
          // Redirect to login
          console.log('AuthGuard: Redirecting to login');
          router.push('/auth/login');
        }
      } catch (error) {
        console.error('AuthGuard: Error checking authentication:', error);
        // On error, assume not authenticated for protected routes
        setRedirectPath(pathname || '/app');
        router.push('/auth/login');
      }
      
      setIsLoading(false);
    };
    
    checkAuth();
  }, [pathname, router]);

  // Show loading or children based on authorization state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  // Check if current route is public to decide whether to show navbar
  const showNavbar = isPublicRoute(pathname || '');

  return (
    <>
      {showNavbar && <Navbar />}
      {children}
    </>
  );
}
