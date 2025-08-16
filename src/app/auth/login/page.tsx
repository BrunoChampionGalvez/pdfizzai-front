'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '../../../services/auth';
import { useAuthStore } from '../../../store/auth';
import { getRedirectPath, clearRedirectPath } from '../../../lib/auth-utils';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [redirectTarget] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const isRedirecting = useRef<boolean>(false);
  
  const router = useRouter();
  const { setUser } = useAuthStore();

  // Check if already logged in on component mount and get redirect target
  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      // Avoid running this effect if we're already in a redirection process
      if (isRedirecting.current) return;
      
      // Check if user is already authenticated
      try {
        const isAuthenticated = await authService.isAuthenticated();
        
        if (isAuthenticated) {
          console.log('User already logged in, redirecting');
          isRedirecting.current = true;
          
          router.push('/app');
          return;
        }
      } catch (error) {
        console.log('User not authenticated:', error);
      }
      
      setIsCheckingAuth(false);
    };

    checkAuthAndRedirect();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Mark that we're starting the login process
      isRedirecting.current = false;
      
      console.log('Login page: Starting login process...');
      const result = await authService.login({ email, password });
      console.log('Login page: Login successful, got response:', result.user?.id);
      
      // With cookie-based auth, we don't expect a token in the response
      // The server sets the authentication cookie automatically
      
      // Update user state
      setUser(result.user);
      console.log('Login page: User state updated');
      
      // Get redirect destination
      const target = redirectTarget || getRedirectPath() || '/app';
      console.log(`Login page: Login successful, redirecting to: ${target}`);
      
      // Clean up the stored redirect path
      clearRedirectPath();
      
      // Mark that we're starting the redirection to prevent loops
      isRedirecting.current = true;

      // Use window.location for a hard navigation instead of router.push
      // This will reload the page and create a fresh React context
      window.location.href = target;
    } catch (err: unknown) {
      console.error('Login error:', err);
      const errorMessage = err && typeof err === 'object' && 'response' in err && 
        err.response && typeof err.response === 'object' && 'data' in err.response &&
        err.response.data && typeof err.response.data === 'object' && 'message' in err.response.data
        ? String(err.response.data.message)
        : 'Login failed. Please check your credentials.';
      setError(errorMessage);
      isRedirecting.current = false;
    } finally {
      if (!isRedirecting.current) {
        setIsLoading(false);
      }
    }
  };

  // Show loading spinner while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-6">
        <div className="bg-background-secondary rounded-2xl p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-text-primary text-center mb-8">
            Sign In to <span className="text-accent">PDFizz AI</span>
          </h1>

          {error && (
            <div className="bg-red-500 bg-opacity-20 border text-white border-red-500 rounded-lg p-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-text-primary font-medium mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-primary border border-secondary text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:border-accent transition-colors duration-200"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-text-primary font-medium mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-primary border border-secondary text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:border-accent transition-colors duration-200"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-secondary">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="text-accent hover:underline">
                Sign up
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-secondary hover:text-text-primary">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
