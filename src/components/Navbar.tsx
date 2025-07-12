'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../services/auth';

export default function Navbar() {
  const { user, setUser } = useAuthStore();
  const { clearAll } = useChatStore();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await authService.getMe();
        setUser(currentUser);
      } catch (error) {
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [setUser]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await authService.logout();
      useAuthStore.getState().logout();
      clearAll(); // Clear all chat state on logout
      router.push('/');
    } catch (error) {
      console.error('Failed to logout', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="bg-background-header border-b border-secondary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Image 
                src="/refdoc-ai-logo.png" 
                alt="RefDoc AI Logo" 
                width={120} 
                height={120}
              />
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-8">
              <Link 
                href="/" 
                className="text-text-primary hover:text-accent transition-colors duration-200 px-3 py-2 rounded-md text-sm font-medium"
              >
                Home
              </Link>
              <Link 
                href="/pricing" 
                className="text-text-primary hover:text-accent transition-colors duration-200 px-3 py-2 rounded-md text-sm font-medium"
              >
                Pricing
              </Link>
            </div>
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            {isCheckingAuth ? (
              // Show loading state
              <div className="w-20 h-8 bg-secondary/20 rounded-md animate-pulse"></div>
            ) : user ? (
              // Show app access and logout for authenticated users
              <>
                <Link
                  href="/app"
                  className="bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-md transition-colors duration-200 text-sm"
                >
                  Go to App
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-4 rounded-md transition-colors duration-200 text-sm"
                >
                  {isLoggingOut ? 'Logging out...' : 'Log Out'}
                </button>
              </>
            ) : (
              // Show login/signup for non-authenticated users
              <>
                <Link
                  href="/auth/login"
                  className="text-text-primary hover:text-accent transition-colors duration-200 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Log In
                </Link>
                <Link
                  href="/auth/signup"
                  className="bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-md transition-colors duration-200 text-sm"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="text-text-primary hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary p-2"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`md:hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-background-secondary border-t border-secondary">
          <Link 
            href="/" 
            className="text-text-primary hover:text-accent block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Home
          </Link>
          <Link 
            href="/pricing" 
            className="text-text-primary hover:text-accent block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Pricing
          </Link>
          
          {!isCheckingAuth && (
            <div className="pt-4 pb-3 border-t border-secondary space-y-2">
              {user ? (
                <>
                  <Link
                    href="/app"
                    className="bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-3 rounded-md transition-colors duration-200 text-sm block text-center"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Go to App
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={isLoggingOut}
                    className="bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-2 px-3 rounded-md transition-colors duration-200 text-sm block text-center w-full mx-3"
                  >
                    {isLoggingOut ? 'Logging out...' : 'Log Out'}
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="text-text-primary hover:text-accent block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Log In
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-3 rounded-md transition-colors duration-200 text-sm block text-center mx-3"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
