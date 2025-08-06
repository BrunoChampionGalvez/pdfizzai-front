'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFileSystemStore } from '../../store/filesystem';
import { useChatStore } from '../../store/chat';
import { useAuthStore } from '../../store/auth';
import { useSubscriptionStore } from '../../store/subscription';
import { usePDFViewer } from '../../contexts/PDFViewerContext';
import { fileSystemService } from '../../services/filesystem';
import { chatService } from '../../services/chat';
import { authService } from '../../services/auth';
import { subscriptionService } from '../../services/subscription';
import ChatPane from '../../components/ChatPane';
import PDFViewer from '../../components/PDFContainer';
import { setRedirectPath } from '../../lib/auth-utils';
import { isAuthError } from '../../types/errors';
import { initializePaddle } from '@paddle/paddle-js';

export default function AppPage() {
  const { currentFolderId, setFolders, setFiles, setLoading: setFSLoading } = useFileSystemStore();
  const { 
    currentReference, 
    setSessions, 
    setLoading: setChatLoading 
  } = useChatStore();
  const { user } = useAuthStore();
  const { isSubscriptionActive, dbSubscription } = useSubscriptionStore();
  const { showFileDisplay } = usePDFViewer();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const initializePaddleFunction = async () => {
    // Initialize Paddle on client side
      await initializePaddle({
        token: process.env.NEXT_PUBLIC_PADDLE_KEY as string, // replace with a client-side token
        environment: 'sandbox'
      });
    }
    initializePaddleFunction();
  }, []);

  // Enhanced authentication check on mount with debug
  useEffect(() => {
    const checkAuth = async () => {
      console.log('Running auth check in app page');
      
      try {
        const isAuthenticated = await authService.isAuthenticated();
        console.log('User authenticated:', isAuthenticated);
        
        if (!isAuthenticated) {
          console.log('User not logged in, redirecting from app page');
          
          // Store current path before redirecting
          setRedirectPath(window.location.pathname);
          
          // Redirect to login page
          router.push('/auth/login');
          return;
        }
        
        console.log('User is logged in, proceeding with app initialization');
        
        // Load subscription data for authenticated user
        if (user?.id) {
          try {
            await subscriptionService.loadUserSubscriptionData(user.id);
            console.log('Subscription data loaded successfully');
            
            // Check subscription status but DON'T redirect - let user access app regardless
            const hasAccess = subscriptionService.hasAppAccess();
            const userIsSubscriptionActive = isSubscriptionActive();
            
            if (!hasAccess && !userIsSubscriptionActive) {
              console.log('User does not have active subscription, but allowing app access with prompts');
              setError('Subscribe to unlock full access to RefDoc AI features');
            } else if (!userIsSubscriptionActive) {
              // User has canceled subscription but still has access until end of billing period
              console.log('User has canceled subscription but retains access until billing period ends');
              setError(null); // Don't show subscription error for canceled users with remaining access
            } else {
              console.log('User has active subscription');
              setError(null); // Clear any previous subscription errors
            }
          } catch (error) {
            console.error('Failed to load subscription data:', error);
            // Allow user to continue but show error
            setError('Failed to load subscription information');
          }
        }
        
      } catch (error) {
        console.error('Auth check failed:', error);
        setRedirectPath(window.location.pathname);
        router.push('/auth/login');
        return;
      }
    };

    checkAuth();
  }, [router, user?.id, isSubscriptionActive]);

  // Conditionally refresh subscription data to catch webhook updates after payment
  useEffect(() => {
    if (!user?.id) return;
    
    const refreshSubscription = async () => {
      try {
        await subscriptionService.loadUserSubscriptionData(user.id);
        
        // If subscription becomes active, clear any subscription errors
        if (subscriptionService.hasAppAccess() && error?.includes('Subscribe to unlock')) {
          setError(null);
          console.log('Subscription activated - clearing subscription error');
          
          // Clean up URL parameters if they exist (likely from payment redirect)
          if (window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          
          // Stop polling once subscription is activated
          return true; // Signal to stop polling
        }
        
        // Also stop polling if user has a canceled subscription but still has access
        // This prevents infinite polling for canceled subscriptions
        if (dbSubscription?.status === 'canceled' || dbSubscription?.scheduledCancel) {
          console.log('User has canceled subscription - stopping polling');
          return true; // Signal to stop polling
        }
      } catch (err) {
        console.error('Failed to refresh subscription data:', err);
      }
      return false; // Continue polling
    };

    // Check for URL parameters that might indicate recent payment
    const urlParams = new URLSearchParams(window.location.search);
    const mightBeFromPayment = urlParams.size > 0; // Any URL params might indicate redirect from payment
    
    // Only poll if there's a subscription error (user needs subscription) or if coming from payment
    // But don't poll for canceled subscriptions that still have access
    const needsPolling = (error?.includes('Subscribe to unlock') || mightBeFromPayment) && 
                        !(dbSubscription?.status === 'canceled' || dbSubscription?.scheduledCancel);
    
    if (needsPolling) {
      console.log('Starting subscription polling due to:', mightBeFromPayment ? 'payment redirect detected' : 'subscription required');
      console.log('Current subscription status:', dbSubscription?.status, 'scheduledCancel:', dbSubscription?.scheduledCancel);
      
      // Start with immediate check, then few quick checks
      const quickChecks = [0, 2000, 5000, 10000]; // Check immediately, then at 2s, 5s, 10s
      let pollingStopped = false;
      
      const runQuickChecks = async () => {
        for (const delay of quickChecks) {
          if (pollingStopped) break;
          
          await new Promise(resolve => setTimeout(resolve, delay));
          if (pollingStopped) break;
          
          const shouldStop = await refreshSubscription();
          if (shouldStop) {
            pollingStopped = true;
            break;
          }
        }
        
        // If still need polling after quick checks, use longer intervals (only for subscription errors)
        if (!pollingStopped && error?.includes('Subscribe to unlock')) {
          const interval = setInterval(async () => {
            const shouldStop = await refreshSubscription();
            if (shouldStop) {
              clearInterval(interval);
            }
          }, 60000); // Check every 60 seconds instead of 30
          
          // Stop polling after 10 minutes max
          setTimeout(() => {
            clearInterval(interval);
            pollingStopped = true;
          }, 10 * 60 * 1000);
          
          return () => {
            clearInterval(interval);
            pollingStopped = true;
          };
        }
      };
      
      runQuickChecks();
      
      return () => {
        pollingStopped = true;
      };
    }
    
    // No polling needed if user has access and no payment indicators
    console.log('No subscription polling needed - user has access or no payment detected');
    console.log('Polling decision - needsPolling:', needsPolling, 'error:', error, 'mightBeFromPayment:', mightBeFromPayment, 'canceled:', dbSubscription?.status === 'canceled' || dbSubscription?.scheduledCancel);
  }, [user?.id, error, dbSubscription?.scheduledCancel, dbSubscription?.status]);

  // Load initial folders and files
  useEffect(() => {
    const loadFolderContents = async () => {
      try {
        console.log('Loading folder contents');
        setFSLoading(true);
        const { folders, files } = await fileSystemService.getFolders(currentFolderId || undefined);
        setFolders(folders);
        setFiles(files);
        console.log('Folder contents loaded successfully');
      } catch (error) {
        console.error('Failed to load folders', error);
        if (isAuthError(error)) {
          // Auth error will be handled by the API interceptor
          setError('Session expired. Please log in again.');
        } else {
          setError('Failed to load folder contents');
        }
      } finally {
        setFSLoading(false);
        setIsInitialLoading(false);
      }
    };

    loadFolderContents();
  }, [currentFolderId, setFolders, setFiles, setFSLoading]);

  // Load chat sessions without creating initial session
  useEffect(() => {
    const loadChatSessions = async () => {
      try {
        setChatLoading(true);
        const sessions = await chatService.getUserSessions();
        setSessions(sessions);
        
        // Don't automatically create a session - let user send first message or click "New Chat"
        console.log(`Loaded ${sessions.length} existing chat sessions`);
        
      } catch (error) {
        console.error('Failed to load chat sessions', error);
        if (isAuthError(error)) {
          // Auth error will be handled by the API interceptor
          setError('Session expired. Please log in again.');
        } else {
          setError('Failed to load chat sessions');
        }
      } finally {
        setChatLoading(false);
      }
    };

    loadChatSessions();
  }, [setSessions, setChatLoading, setError]);

  // When no files are selected or referenced, show welcome screen
  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center">
        <div className="animate-pulse text-accent text-2xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    // Check if this is a subscription-related error
    const isSubscriptionError = error.includes('Subscribe to unlock') || error.includes('subscription');
    
    return (
      <div className="flex items-center justify-center p-4 h-full">
        <div className={`border px-4 py-3 rounded flex flex-col justify-center items-center ${
          isSubscriptionError 
            ? 'bg-blue-50 border-blue-200 text-blue-800' 
            : 'bg-red-100 border-red-400 text-red-700'
        }`}>
          <p className="font-bold">{isSubscriptionError ? 'Subscription Required' : 'Error'}</p>
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            {isSubscriptionError ? (
              <>
                <button 
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm cursor-pointer"
                  onClick={() => router.push('/pricing')}
                >
                  View Plans
                </button>
              </>
            ) : (
              <button 
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`flex h-full bg-background-chat ${currentReference && showFileDisplay ? 'flex-col md:flex-row' : ''}`}>
        <ChatPane />
        {currentReference && showFileDisplay && <PDFViewer />}
      </div>
    </div>
  );
}
