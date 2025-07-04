'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chat';
import { chatService } from '../services/chat';
import { generateId } from '../lib/utils';
import MessageBubble from './MessageBubble';

export default function ChatPane() {
  const [message, setMessage] = useState('');
  const [isNewSession, setIsNewSession] = useState(true);
  const { 
    currentSessionId, 
    messages, 
    addMessage, 
    setMessages, 
    setCurrentSessionId,
    isLoading, 
    setLoading
  } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load chat history when session changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (currentSessionId) {
        try {
          setLoading(true);
          const history = await chatService.getChatHistory(currentSessionId);
          setMessages(history);
          setIsNewSession(false);
        } catch (error) {
          console.error('Failed to load chat history', error);
        } finally {
          setLoading(false);
        }
      } else {
        setMessages([]);
        setIsNewSession(true);
      }
    };

    loadChatHistory();
  }, [currentSessionId, setMessages, setLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      // Create a new chat session if needed
      if (!currentSessionId) {
        setLoading(true);
        const newSession = await chatService.createSession();
        setCurrentSessionId(newSession.id);
      }

      const currentTime = new Date().toISOString();
      // Add user message immediately
      const userMessage = {
        id: generateId(),
        role: 'user' as const,
        content: message,
        timestamp: currentTime
      };
      addMessage(userMessage);
      setMessage('');

      // Show assistant is typing
      setLoading(true);
      
      // Send message to API
      const response = await chatService.sendMessage(
        currentSessionId!, 
        message
      );
      
      // Add AI response
      const aiMessage = {
        id: generateId(),
        role: 'assistant' as const,
        content: response.reply,
        timestamp: new Date().toISOString(),
        references: response.references
      };
      addMessage(aiMessage);
      
    } catch (error) {
      console.error('Failed to send message', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background-chat h-full flex-1 flex flex-col transition-all duration-300 pl-10 shadow-sm mt-6">
      <div className="flex justify-between items-center ml-4 pb-4">
        <h2 className="text-lg font-medium text-text-primary">
          {isNewSession ? 'New Chat' : 'Chat Session'}
        </h2>
      </div>

      <div className={`flex-1 overflow-y-auto h-full relative p-4 ${isNewSession ? 'flex items-center justify-center' : ''}`}>
        {messages.length === 0 ? (
          <div className="w-full max-w-2xl transition-all duration-500">
            <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
              <div className="text-center text-text-primary text-4xl font-semibold mb-8 absolute top-40 right-0 left-0">
                Ask something about your documents
              </div>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your question here..."
                className="w-full bg-primary border border-secondary rounded-lg px-6 py-4 focus:outline-none focus:border-accent text-text-primary text-lg"
                disabled={isLoading}
                autoFocus
              />
              <button
                type="submit"
                disabled={isLoading || !message.trim()}
                className={`w-full bg-accent hover:bg-accent-300 text-primary font-semibold py-3 px-4 rounded-lg transition-colors text-lg
                  ${isLoading || !message.trim() ? 'opacity-50 cursor-not-allowed' : ' cursor-pointer'}`}
              >
                {isLoading ? <LoadingIcon /> : 'Ask Refery AI'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {messages.map(message => (
              <MessageBubble
                key={message.id}
                id={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                references={message.references}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {!isNewSession && (
        <div className="p-4 animate-slideUp">
          <form onSubmit={handleSubmit} className="flex">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask a follow-up question..."
              className="flex-1 bg-primary border border-secondary rounded-l-lg px-4 py-2 focus:outline-none focus:border-accent text-text-primary"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !message.trim()}
              className={`bg-accent hover:bg-accent-300 text-primary font-semibold px-4 py-2 rounded-r-lg transition-colors
                ${isLoading || !message.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? <LoadingIcon /> : <SendIcon />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Icon components
function ChevronIcon({ direction = 'left' }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      className="h-5 w-5" 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
      style={{ transform: direction === 'right' ? 'rotate(180deg)' : 'none' }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}
