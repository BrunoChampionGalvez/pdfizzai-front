'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { authService } from '../services/auth';
import { chatService } from '../services/chat';

export default function Header() {
  const { user } = useAuthStore();
  const { 
    sessions, 
    currentSessionId, 
    setCurrentSessionId, 
    addSession, 
    clearMessages 
  } = useChatStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await authService.logout();
      useAuthStore.getState().logout();
      router.push('/');
    } catch (error) {
      console.error('Failed to logout', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const createNewSession = async () => {
    try {
      setIsCreatingSession(true);
      const newSession = await chatService.createSession();
      addSession(newSession);
      setCurrentSessionId(newSession.id);
      clearMessages();
    } catch (error) {
      console.error('Failed to create new session', error);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSessionChange = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    clearMessages();
  };

  return (
    <header className="bg-background-header p-4 flex justify-between items-center shadow-sm z-10">
      <div className="flex items-center">
        <div className="text-xl font-bold text-accent mr-8">RefDoc AI</div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={createNewSession}
            disabled={isCreatingSession}
            className="bg-accent hover:bg-accent-300 text-primary px-3 py-1 rounded-lg transition-colors duration-200 flex items-center cursor-pointer font-medium"
          >
            <PlusIcon className="w-4 h-4 mr-1" />
            {isCreatingSession ? 'Creating...' : 'New Chat'}
          </button>
          
          {sessions.length > 0 && (
            <select
              value={currentSessionId || ''}
              onChange={(e) => handleSessionChange(e.target.value)}
              className="bg-primary border border-secondary text-text-primary px-3 py-1 rounded-lg focus:outline-none focus:border-accent transition-colors"
            >
              <option value="" disabled>Select a chat session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {new Date(session.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        {user && (
          <div className="text-text-primary">
            {user.email}
          </div>
        )}
        
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="bg-secondary hover:bg-secondary-200 text-text-primary px-3 py-1 rounded-lg transition-colors duration-200 cursor-pointer"
        >
          {isLoggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </header>
  );
}

function PlusIcon({ className = 'w-6 h-6' }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      className={className} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M12 4v16m8-8H4" 
      />
    </svg>
  );
}
