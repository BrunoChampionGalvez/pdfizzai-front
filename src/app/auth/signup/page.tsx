'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '../../../services/auth';
import { useAuthStore } from '../../../store/auth';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setUser } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsLoading(true);

    try {
      const response = await authService.signup({ email, password });
      setUser(response.user);
      router.push('/app');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to sign up. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <div className="bg-background-secondary p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold mb-6 text-text-primary text-center">
          Create an Account on <span className="text-accent">Refery AI</span>
        </h2>
        
        {error && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-text-primary mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-primary border border-secondary text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:border-accent transition-colors duration-200 w-full"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-text-primary mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-primary border border-secondary text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:border-accent transition-colors duration-200 w-full"
              required
              minLength={6}
            />
            <p className="text-secondary text-sm mt-1">
              Must be at least 6 characters
            </p>
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-text-primary mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-primary border border-secondary text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:border-accent transition-colors duration-200 w-full"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex justify-center"
          >
            {isLoading ? (
              <span className="animate-pulse">Creating account...</span>
            ) : (
              'Sign Up'
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center text-secondary">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
