'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/auth';
import { useChatStore } from '../../store/chat';
import { authService } from '../../services/auth';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import ErrorBoundary from '../../components/ErrorBoundary';
import { PDFViewerProvider } from '../../contexts/PDFViewerContext';
import { ToastProvider } from '../../components/ToastProvider';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, setUser, setLoading } = useAuthStore();
  const { clearAll } = useChatStore();
  const router = useRouter();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        const currentUser = await authService.getMe();
        
        // Only clear chat state if the user ID actually changed (not on first load)
        // and if we had a previous user (to prevent clearing on page refresh)
        if (previousUserIdRef.current && 
            previousUserIdRef.current !== currentUser.id && 
            previousUserIdRef.current !== null) {
          console.log('User changed from', previousUserIdRef.current, 'to', currentUser.id, ', clearing chat state');
          clearAll(); // Clear all chat state when user changes
        }
        
        // Only update the ref if it's actually different or first time
        if (previousUserIdRef.current !== currentUser.id) {
          previousUserIdRef.current = currentUser.id;
          setUser(currentUser);
        }
      } catch {
        // User logged out or session expired
        const hadPreviousUser = previousUserIdRef.current !== null;
        if (hadPreviousUser) {
          console.log('User logged out, clearing chat state');
          clearAll(); // Clear chat state on logout
        }
        previousUserIdRef.current = null;
        setUser(null);
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [setUser, setLoading, router, clearAll]);

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
    <ToastProvider>
      <div className="flex flex-col h-full bg-primary relative">
        <Header />
        <PDFViewerProvider>
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
          </div>
        </PDFViewerProvider>
      </div>
    </ToastProvider>
  );
}
