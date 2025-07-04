'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { authService } from '../../services/auth';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import ErrorBoundary from '../../components/ErrorBoundary';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, setUser, setLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const user = await authService.getMe();
        setUser(user);
      } catch (error) {
        setUser(null);
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [setUser, setLoading, router]);

  if (isLoading) {
    return (
      <div className="h-screen bg-primary flex items-center justify-center">
        <div className="animate-pulse text-accent text-2xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will be redirected by the useEffect
  }

  return (
    <div className="flex flex-col h-full bg-primary">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
