'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFileSystemStore } from '../../store/filesystem';
import { useChatStore } from '../../store/chat';
import { usePDFViewer } from '../../contexts/PDFViewerContext';
import { fileSystemService } from '../../services/filesystem';
import { chatService } from '../../services/chat';
import { authService } from '../../services/auth';
import ChatPane from '../../components/ChatPane';
import PDFViewer from '../../components/PDFContainer';
import { setRedirectPath } from '../../lib/auth-utils';
import { isAuthError } from '../../types/errors';

export default function AppPage() {
  const { currentFolderId, setFolders, setFiles, setLoading: setFSLoading } = useFileSystemStore();
  const { 
    currentSessionId, 
    currentReference, 
    setSessions, 
    setCurrentSessionId,
    addSession,
    setLoading: setChatLoading 
  } = useChatStore();
  const { showFileDisplay } = usePDFViewer();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      } catch (error) {
        console.error('Auth check failed:', error);
        setRedirectPath(window.location.pathname);
        router.push('/auth/login');
        return;
      }
    };

    checkAuth();
  }, [router]);

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
    return (
      <div className="flex items-center justify-center p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
          <button 
            className="mt-2 bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
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
