'use client';

import Link from 'next/link';
import { useAuthStore } from '../store/auth';
import { useEffect } from 'react';
import { authService } from '../services/auth';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { isAuthenticated, setUser, setLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const user = await authService.getMe();
        setUser(user);
        router.push('/app');
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [setUser, setLoading, router]);

  if (isAuthenticated) {
    return null; // Will redirect to /app
  }

  return (
    <div className="h-screen bg-primary flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-5xl font-bold text-text-primary mb-8">
          Welcome to <span className="text-accent">RefDoc AI</span>
        </h1>
        
        <p className="text-xl text-secondary mb-12 max-w-2xl mx-auto">
          Upload your PDF documents and chat with AI to get intelligent answers 
          with precise references to your content. Transform how you interact with your documents.
        </p>

        <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
          <Link
            href="/auth/signup"
            className="inline-block bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-8 rounded-lg transition-colors duration-200 text-lg"
          >
            Get Started
          </Link>
          
          <Link
            href="/auth/login"
            className="inline-block bg-secondary hover:bg-secondary-200 text-text-primary font-semibold py-3 px-8 rounded-lg transition-colors duration-200 text-lg"
          >
            Sign In
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 bg-background-secondary rounded-2xl">
            <div className="text-accent text-4xl mb-4">📄</div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Upload PDFs</h3>
            <p className="text-secondary">
              Organize your documents in folders and upload PDFs securely to the cloud.
            </p>
          </div>

          <div className="p-6 bg-background-secondary rounded-2xl">
            <div className="text-accent text-4xl mb-4">💬</div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Chat with AI</h3>
            <p className="text-secondary">
              Ask questions about your documents and get intelligent, contextual responses.
            </p>
          </div>

          <div className="p-6 bg-background-secondary rounded-2xl">
            <div className="text-accent text-4xl mb-4">🔗</div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Precise References</h3>
            <p className="text-secondary">
              Get exact page numbers and text snippets with clickable references to source material.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
