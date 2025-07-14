'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { authService } from '../services/auth';
import { chatService } from '../services/chat';
import Image from 'next/image';

export default function Header() {
  const { user } = useAuthStore();
  const { 
    sessions, 
    currentSessionId, 
    setCurrentSessionId, 
    addSession, 
    clearMessages,
    clearAll
  } = useChatStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

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
      <div className="flex items-center" style={{ height: 50, overflowY: 'hidden' }}>
        <Image src="/refdoc-ai-logo.png" alt="RefDoc AI Logo" width={150} height={150} />
        
        <div className="flex items-center space-x-4">
          <button
        onClick={createNewSession}
        disabled={isCreatingSession}
        className="bg-accent hover:bg-accent-300 text-primary px-3 py-1 rounded-lg transition-colors duration-200 flex items-center cursor-pointer font-medium ml-10"
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
          <option value="" disabled>
            {sessions.length === 0 ? 'No chat sessions' : 'Select a chat session'}
          </option>
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
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 text-text-primary hover:text-accent transition-colors duration-200 cursor-pointer"
            >
              <UserIcon className="w-5 h-5" />
              <span>{user.name || user.email}</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-background-secondary border border-secondary rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => {
                      router.push('/subscription');
                      setIsDropdownOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-text-primary hover:bg-primary hover:text-accent cursor-pointer transition-colors duration-200"
                  >
                    <CreditCardIcon className="w-4 h-4 mr-3" />
                    Subscription
                  </button>
                  <hr className="border-secondary" />
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsDropdownOpen(false);
                    }}
                    disabled={isLoggingOut}
                    className="flex items-center w-full px-4 py-2 text-sm text-text-primary hover:bg-primary hover:text-accent cursor-pointer transition-colors duration-200"
                  >
                    <LogoutIcon className="w-4 h-4 mr-3" />
                    {isLoggingOut ? 'Logging out...' : 'Log out'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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

function UserIcon({ className = 'w-6 h-6' }) {
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
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
      />
    </svg>
  );
}

function ChevronDownIcon({ className = 'w-6 h-6' }) {
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
        d="M19 9l-7 7-7-7" 
      />
    </svg>
  );
}

function CreditCardIcon({ className = 'w-6 h-6' }) {
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
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" 
      />
    </svg>
  );
}

function LogoutIcon({ className = 'w-6 h-6' }) {
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
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
      />
    </svg>
  );
}
