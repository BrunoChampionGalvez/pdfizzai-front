'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '../../../services/auth';
import { useAuthStore } from '../../../store/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await authService.login({ email, password });
      setUser(result.user);
      router.push('/app');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-6">
        <div className="bg-background-secondary rounded-2xl p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-text-primary text-center mb-8">
            Sign In to <span className="text-accent">Refery AI</span>
          </h1>

          {error && (
            <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-500 rounded-lg p-3 mb-6">
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
              Don't have an account?{' '}
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
