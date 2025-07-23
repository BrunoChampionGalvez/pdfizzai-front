'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store/chat';
import { useUIStore } from '../store/ui';
import { useSubscriptionStore } from '../store/subscription';
import { useAuthStore } from '../store/auth';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { chatService } from '../services/chat';
import { fileSystemService } from '../services/filesystem';
import { subscriptionService } from '../services/subscription';
import { generateId } from '../lib/utils';
import MessageBubble from './MessageBubble';
import { MentionedMaterial, StudyMaterial } from '../types/chat';
import { useRouter } from 'next/navigation';
import { extractErrorMessage, isAuthError } from '../types/errors';

export default function ChatPane() {
  const [message, setMessage] = useState('');
  const [isNewSession, setIsNewSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionJustCreated, setSessionJustCreated] = useState<string | null>(null);
  const { 
    currentSessionId, 
    messages, 
    addMessage, 
    setMessages, 
    setCurrentSessionId,
    isLoading, 
    setLoading,
    currentReference,
    updateMessage,
    updateMessageContent,
    updateMessageId,
    addSession
  } = useChatStore();
  const { isSidebarCollapsed } = useUIStore();
  const { 
    hasExceededMessageLimit, 
    getMessagesRemaining, 
    getNextBillingDate, 
    isSubscriptionActive,
    getCurrentMessageLimit
  } = useSubscriptionStore();
  const { user } = useAuthStore();
  const { showFileDisplay } = usePDFViewer();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  
  // @ functionality state
  const [showMentionSearch, setShowMentionSearch] = useState(false);
  const [mentionSearchQuery, setMentionSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudyMaterial[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<MentionedMaterial[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  
  // Handle initial animation
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Load chat history when session changes
  useEffect(() => {
    const loadChatHistory = async () => {
      if (currentSessionId) {
        // Don't load history for sessions that were just created in this component
        if (sessionJustCreated === currentSessionId) {
          console.log('Skipping history load for just-created session:', currentSessionId);
          setIsNewSession(false);
          return;
        }
        
        try {
          setLoading(true);
          const history = await chatService.getChatHistory(currentSessionId);
          console.log('Loaded chat history for session:', currentSessionId, history);
          setMessages(history);
          setIsNewSession(false);
        } catch (error: unknown) {
          console.error('Failed to load chat history', error);
          if (isAuthError(error)) {
            // Auth error will be handled by the API interceptor
            setErrorMessage('Session expired. Please log in again.');
          } else {
            // Set error message for other errors
            setErrorMessage(extractErrorMessage(error));
          }
        } finally {
          setLoading(false);
        }
      } else {
        setMessages([]);
        setIsNewSession(true);
        setSessionJustCreated(null);
      }
    };

    loadChatHistory();
  }, [currentSessionId, setMessages, setLoading, router]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus search input when search is shown
  useEffect(() => {
    if (showMentionSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showMentionSearch]);

  // Handle click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current && 
        !searchResultsRef.current.contains(event.target as Node) &&
        event.target instanceof Node &&
        !((event.target as HTMLElement).classList?.contains('mention-trigger'))
      ) {
        setShowMentionSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Search study materials function
  const searchStudyMaterials = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    
    try {
      // Fetch all files and folders
      const [files, folders] = await Promise.all([
        fileSystemService.getAllFiles(),
        fileSystemService.getAllFolders()
      ]);

      // Build folder paths map for hierarchy
      const folderPathsMap = new Map<string, string[]>();
      const buildFolderPath = (folderId: string, visitedIds = new Set<string>()): string[] => {
        if (visitedIds.has(folderId)) {
          return []; // Prevent infinite recursion
        }
        visitedIds.add(folderId);
        
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return [];
        
        if (folder.parent_id) {
          const parentPath = folderPathsMap.get(folder.parent_id) || buildFolderPath(folder.parent_id, visitedIds);
          const fullPath = [...parentPath, folder.name];
          folderPathsMap.set(folderId, fullPath);
          return fullPath;
        }
        
        folderPathsMap.set(folderId, [folder.name]);
        return [folder.name];
      };

      // Build paths for all folders
      folders.forEach(folder => {
        if (!folderPathsMap.has(folder.id)) {
          buildFolderPath(folder.id);
        }
      });

      // Convert to StudyMaterial format
      const allMaterials: StudyMaterial[] = [
        ...folders.map(folder => ({
          id: folder.id,
          name: folder.name,
          type: 'folder' as const,
          path: folderPathsMap.get(folder.id) || [folder.name],
        })),
        ...files.map(file => {
          let filePath = [file.filename];
          if (file.folder_id) {
            const folderPath = folderPathsMap.get(file.folder_id) || [];
            filePath = [...folderPath, file.filename];
          }
          return {
            id: file.id,
            name: file.filename,
            type: 'file' as const,
            path: filePath,
          };
        }),
      ];

      // Filter based on search query
      const searchTerm = query.toLowerCase();
      const filtered = allMaterials.filter(material => 
        material.name.toLowerCase().includes(searchTerm)
      );

      // Sort results by relevance (exact matches first, then contains)
      filtered.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        if (aName === searchTerm && bName !== searchTerm) return -1;
        if (bName === searchTerm && aName !== searchTerm) return 1;
        
        if (aName.startsWith(searchTerm) && !bName.startsWith(searchTerm)) return -1;
        if (bName.startsWith(searchTerm) && !aName.startsWith(searchTerm)) return 1;
        
        return aName.localeCompare(bName);
      });

      setSearchResults(filtered.slice(0, 10)); // Limit to 10 results
    } catch (error: unknown) {
      console.error('Error searching study materials:', error);
      setSearchResults([]);
      if (isAuthError(error)) {
        setErrorMessage('Session expired. Please log in again.');
      } else {
        setErrorMessage(extractErrorMessage(error));
      }
    } finally {
      setIsSearching(false);
    }
  }, [router]);

  // Handle search input change
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setMentionSearchQuery(query);
    
    // When the user first interacts with the search bar, remove the @ from the chat input
    if (!mentionSearchQuery && query) {
      const lastAtPos = message.lastIndexOf('@');
      if (lastAtPos !== -1) {
        const messageAfterAt = message.slice(lastAtPos + 1).trim();
        if (messageAfterAt === '') {
          const newMessage = message.slice(0, lastAtPos) + ' ';
          setMessage(newMessage.trimEnd());
        }
      }
    }
    
    searchStudyMaterials(query);
  };

  // Handle selection of a study material
  const handleSelectMaterial = (material: StudyMaterial) => {
    const mentionedMaterial: MentionedMaterial = {
      id: material.id,
      displayName: material.path?.join('/') || material.name,
      type: material.type,
      originalName: material.name,
    };
    
    // Check if this material is already selected
    if (selectedMaterials.some(m => m.id === mentionedMaterial.id)) {
      return;
    }
    
    // Add to selected materials
    setSelectedMaterials(prev => [...prev, mentionedMaterial]);
    
    // Clear search
    setMentionSearchQuery('');
    setShowMentionSearch(false);
    setSearchResults([]);
  };

  // Handle keydown in search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      handleSelectMaterial(searchResults[0]);
    } else if (e.key === 'Escape') {
      setShowMentionSearch(false);
    }
  };

  // Handle removing a selected material
  const handleRemoveMaterial = (id: string) => {
    setSelectedMaterials(prev => prev.filter(material => material.id !== id));
  };

  // Toggle mention search
  const toggleMentionSearch = () => {
    setShowMentionSearch(prev => !prev);
    if (!showMentionSearch) {
      setMentionSearchQuery('');
      setSearchResults([]);
    }
  };

  // Handle message change with @ detection
  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);
    
    // Clear any previous error messages when user starts typing again
    if (errorMessage) {
      setErrorMessage(null);
    }
    
    // Check if the user just typed @
    const lastAtPos = newMessage.lastIndexOf('@');
    if (lastAtPos !== -1 && (lastAtPos === 0 || newMessage[lastAtPos - 1] === ' ')) {
      const charAfterAt = newMessage.charAt(lastAtPos + 1);
      if (charAfterAt === ' ') {
        setShowMentionSearch(false);
        return;
      }
      
      const searchQuery = newMessage.slice(lastAtPos + 1).split(' ')[0];
      if (searchQuery) {
        setMentionSearchQuery(searchQuery);
        searchStudyMaterials(searchQuery);
        setShowMentionSearch(true);
      } else {
        setShowMentionSearch(true);
        setMentionSearchQuery('');
        setSearchResults([]);
      }
    }
  };

  // Handle Enter key press for textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    // Check if user can send messages (hasn't exceeded limit)
    if (!subscriptionService.canSendMessages()) {
      setErrorMessage('You have reached your message limit for this billing period.');
      return;
    }
    
    // Clear any previous error messages and set loading state
    setErrorMessage(null);
    setLoading(true);

    try {
      // Create a new chat session if needed
      let sessionId = currentSessionId;
      if (!sessionId) {
        const newSession = await chatService.createSession();
        sessionId = newSession.id;
        
        // Mark this session as just created to prevent history loading
        setSessionJustCreated(sessionId);
        
        // Clear the flag after a short delay to allow future navigation to this session
        setTimeout(() => {
          setSessionJustCreated(null);
        }, 5000); // Clear after 5 seconds
        
        // Add the session to the sessions list and update the current session
        addSession(newSession);
        setCurrentSessionId(sessionId);
        setIsNewSession(false);
        
        console.log('Created new session:', sessionId);
      }

      // Ensure we have a valid session ID
      if (!sessionId) {
        throw new Error('Failed to create or retrieve chat session');
      }

      // Clean message content - remove @ mentions that are now selected materials
      let cleanedMessage = message;
      if (selectedMaterials.length > 0) {
        selectedMaterials.forEach(material => {
          const patterns = [
            new RegExp(`@${material.displayName}\\b`, 'g'),
            new RegExp(`@${material.originalName.replace(/ /g, '_')}\\b`, 'g')
          ];
          
          patterns.forEach(pattern => {
            cleanedMessage = cleanedMessage.replace(pattern, '');
          });
        });
        
        cleanedMessage = cleanedMessage.replace(/\s+/g, ' ').trim();
      }

      const currentTime = new Date().toISOString();
      // Add user message immediately with cleaned content and selected materials
      let userMessage = {
        id: generateId(),
        role: 'user' as const,
        content: cleanedMessage,
        created_at: currentTime,
        selectedMaterials: selectedMaterials.length > 0 ? [...selectedMaterials] : undefined,
      };
      
      console.log('Adding user message:', userMessage);
      addMessage(userMessage);
      setMessage('');

      // Create AI message placeholder for streaming
      let aiMessageId = generateId();
      const aiMessage = {
        id: aiMessageId,
        role: 'model' as const,
        content: '', // Start with empty content
        created_at: new Date().toISOString(),
        references: []
      };
      
      console.log('Adding AI message placeholder:', aiMessage);
      addMessage(aiMessage);

      // Extract IDs from selected materials
      const fileIds = selectedMaterials
        .filter(material => material.type === 'file')
        .map(material => material.id);
        
      const folderIds = selectedMaterials
        .filter(material => material.type === 'folder')
        .map(material => material.id);
      
      // Use streaming to update the AI message in real-time
      const handleStreaming = async () => {
        let accumulatedContent = '';
        
        try {
          let lastUpdateTime = Date.now();
          const THROTTLE_MS = 50; // Update every 50ms to prevent too frequent renders
          
          for await (const chunk of chatService.sendMessageStream(
            sessionId, // Use the local sessionId variable
            cleanedMessage,
            fileIds,
            folderIds,
            selectedMaterials
          )) {
            // Check for message ID updates first
            if (chunk.includes('[USER_MESSAGE_ID]')) {
              const userIdMatch = chunk.match(/\[USER_MESSAGE_ID\](.*?)\[\/USER_MESSAGE_ID\]/);
              if (userIdMatch) {
                const newUserId = userIdMatch[1];
                console.log(`Updating user message ID from ${userMessage.id} to ${newUserId}`);
                updateMessageId(userMessage.id, newUserId);
                // Update our local reference too
                userMessage.id = newUserId;
              }
              continue; // Don't add ID markers to content
            }
            
            if (chunk.includes('[AI_MESSAGE_ID]')) {
              const aiIdMatch = chunk.match(/\[AI_MESSAGE_ID\](.*?)\[\/AI_MESSAGE_ID\]/);
              if (aiIdMatch) {
                const newAiId = aiIdMatch[1];
                console.log(`Updating AI message ID from ${aiMessageId} to ${newAiId}`);
                updateMessageId(aiMessageId, newAiId);
                // Update our local reference too
                aiMessageId = newAiId;
              }
              continue; // Don't add ID markers to content
            }
            
            // Only process if chunk has content and isn't a message ID marker
            if (chunk) {
              accumulatedContent += chunk;
              const now = Date.now();
              
              // Throttle updates to prevent infinite re-renders
              if (now - lastUpdateTime > THROTTLE_MS) {
                // Update the message with the accumulated content so far
                updateMessage(aiMessageId, accumulatedContent);
                lastUpdateTime = now;
              }
            }
          }
          
          // Send final accumulated content
          updateMessage(aiMessageId, accumulatedContent);
          
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          // Update the message with an error
          updateMessage(aiMessageId, accumulatedContent + '\n\n*Error: Failed to complete response*');
        } finally {
          // Always set loading to false when streaming is complete
          setLoading(false);
          
          // Refresh message usage after successful message sending
          if (user?.id && accumulatedContent) {
            await subscriptionService.refreshMessageUsage(user.id);
          }
        }
      };
      
      // Start streaming without awaiting to prevent blocking
      handleStreaming();
      
      // Clear selected materials after sending
      setSelectedMaterials([]);
      
    } catch (error: unknown) {
      console.error('Failed to send message', error);
      
      // Handle authentication errors
      if (isAuthError(error)) {
        setErrorMessage('Session expired. Please log in again.');
        setLoading(false);
        return;
      }
      
      // Set error message for display and clear loading
      setErrorMessage(extractErrorMessage(error));
      setLoading(false);
    }
    // Remove the finally block since loading is now handled in handleStreaming
  };

  // Determine if we're in side panel mode (when a file is selected and being displayed)
  const isSidePanelMode = !!currentReference?.fileId && showFileDisplay;

  return (
    <div 
      className={`bg-background-chat relative h-full flex flex-col transition-all duration-300 ease-in-out shadow-sm
        ${isSidePanelMode 
          ? (isSidebarCollapsed ? 'w-1/4' : 'w-1/3') // Smaller width when PDF is shown
          : 'w-full max-w-4xl mx-auto px-8'          // Centered with max width when no PDF
        } ${mounted ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className={`flex justify-between items-center pb-4 mt-6 ${isSidePanelMode ? 'ml-4' : ''}`}>
        <h2 className="text-lg font-medium text-text-primary">
          {isNewSession ? 'New Chat' : 'Chat Session'}
        </h2>
      </div>

      <div className={`flex-1 absolute top-0 right-0 left-0 overflow-y-auto p-4 h-full pb-24 pt-18 ${messages.length === 0 && isNewSession && !isSidePanelMode ? 'flex flex-col items-center justify-center' : ''}`}>
        {messages.length === 0 && isNewSession && !isSidePanelMode ? (
          <div className="w-full max-w-2xl transition-all duration-500 flex flex-col items-center">
            <div className="text-center text-text-primary text-4xl font-semibold mb-8">
              Ask something about your documents
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col space-y-4 w-full">
              
              {/* Error message display */}
              {errorMessage && (
                <div className="mb-3 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md">
                  <p className="font-semibold">Error:</p>
                  <p>{errorMessage}</p>
                </div>
              )}
              
              {/* Selected materials display for new session */}
              {selectedMaterials.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedMaterials.map(material => (
                    <div 
                      key={material.id} 
                      className="inline-flex items-center bg-primary-100 border-2 border-accent text-accent px-2 py-1 rounded-md text-sm"
                    >
                      <span className="mr-1">
                        {material.type === 'folder' && '📁'}
                        {material.type === 'file' && '📄'}
                      </span>
                      <span>{material.displayName}</span>
                      <button 
                        className="ml-1 text-gray-500 hover:text-gray-700"
                        onClick={() => handleRemoveMaterial(material.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Mention search dropdown for new session */}
              {showMentionSearch && (
                <div className="relative mb-3" ref={searchResultsRef}>
                  {mentionSearchQuery && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-primary border border-secondary rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                      {isSearching ? (
                        <div className="p-3 text-center text-text-secondary">Searching...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="p-3 text-center text-text-secondary">No results found</div>
                      ) : (
                        <ul>
                          {searchResults.map((item, index) => (
                            <li 
                              key={item.id}
                              className={`p-2 hover:bg-secondary cursor-pointer ${index === 0 ? 'bg-secondary border-l-2 border-accent' : ''}`}
                              onClick={() => handleSelectMaterial(item)}
                            >
                              <div className="flex items-center">
                                <span className="mr-2">
                                  {item.type === 'folder' && '📁'}
                                  {item.type === 'file' && '📄'}
                                </span>
                                <div>
                                  <div className="font-medium text-text-primary">{item.name}</div>
                                  <div className="text-xs text-text-secondary">{item.path?.join('/')}</div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="flex items-center bg-primary border border-secondary rounded-md overflow-hidden">
                    <span className="text-lg font-medium px-2 text-text-secondary">@</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="flex-grow p-2 outline-none bg-transparent text-text-primary"
                      placeholder="Search files and folders..."
                      value={mentionSearchQuery}
                      onChange={handleSearchInputChange}
                      onKeyDown={handleSearchKeyDown}
                    />
                  </div>
                </div>
              )}

              {/* Message usage indicator for new session */}
              {!hasExceededMessageLimit() && isSubscriptionActive() && getMessagesRemaining() <= 10 && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <svg className="h-4 w-4 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.856-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <p className="text-yellow-800 font-medium text-sm">Low message count</p>
                      <p className="text-yellow-700 text-xs">
                        {getMessagesRemaining()} of {getCurrentMessageLimit()} messages remaining.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Message limit warning for new session */}
              {hasExceededMessageLimit() && (
                <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                  <div className="flex items-center">
                    <svg className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.856-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <p className="text-red-800 font-medium">Message limit reached</p>
                      <p className="text-red-700 text-sm">
                        You have used all {getCurrentMessageLimit()} messages allowed with your plan.
                        {getNextBillingDate() && (
                          <span> Your limit will reset on {getNextBillingDate()!.toLocaleDateString()}.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-end w-full min-h-[4rem]">
                <textarea
                  value={message}
                  onChange={handleMessageChange}
                  onKeyDown={handleKeyDown}
                  placeholder={hasExceededMessageLimit() ? "Message limit reached" : "Type your question here..."}
                  className="flex-1 bg-primary border border-secondary rounded-l-lg px-6 py-4 focus:outline-none focus:border-accent text-text-primary text-lg resize-none overflow-hidden min-h-[4rem] max-h-[10rem]"
                  disabled={isLoading || hasExceededMessageLimit()}
                  autoFocus
                  rows={1}
                  style={{
                    height: 'auto',
                    minHeight: '4rem',
                    maxHeight: '10rem'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 160) + 'px';
                  }}
                />
                <button
                  type="button"
                  onClick={toggleMentionSearch}
                  className="bg-secondary hover:bg-secondary-300 text-text-primary font-semibold px-4 py-4 transition-colors mention-trigger border border-secondary border-l-0 h-16"
                  title="Add files or folders to context"
                  disabled={hasExceededMessageLimit()}
                >
                  <span className="text-lg font-medium">@</span>
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !message.trim() || hasExceededMessageLimit()}
                  className={`bg-accent hover:bg-accent-300 text-primary font-semibold py-4 px-6 rounded-r-lg transition-colors text-lg h-16
                    ${isLoading || !message.trim() || hasExceededMessageLimit() ? 'opacity-50 cursor-not-allowed' : ' cursor-pointer'}`}
                >
                  {isLoading ? <LoadingIcon /> : 'Ask RefDoc AI'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Error message display */}
            {errorMessage && (
              <div className="mb-3 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md">
                <p className="font-semibold">Error:</p>
                <p>{errorMessage}</p>
              </div>
            )}
            
            {messages.map(message => (
              <MessageBubble
                key={message.id}
                id={message.id}
                role={message.role}
                firstContent={message.content}
                created_at={message.created_at}
                references={message.references}
                selectedMaterials={message.selectedMaterials}
                isSidePanelMode={isSidePanelMode}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {(messages.length > 0 || !isNewSession || isSidePanelMode) && (
        <div className="p-4 animate-slideUp absolute bottom-6 left-0 right-0">
          {/* Selected materials display */}
          {selectedMaterials.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedMaterials.map(material => (
                <div 
                  key={material.id} 
                  className="inline-flex items-center bg-primary-100 text-accent border-2 border-accent px-2 py-1 rounded-md text-sm"
                >
                  <span className="mr-1">
                    {material.type === 'folder' && '📁'}
                    {material.type === 'file' && '📄'}
                  </span>
                  <span>{material.displayName}</span>
                  <button 
                    className="ml-1 text-gray-500 hover:text-gray-700"
                    onClick={() => handleRemoveMaterial(material.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Mention search dropdown */}
          {showMentionSearch && (
            <div className="relative mb-3" ref={searchResultsRef}>
              {mentionSearchQuery && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-primary border border-secondary rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-3 text-center text-text-secondary">Searching...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-3 text-center text-text-secondary">No results found</div>
                  ) : (
                    <ul>
                      {searchResults.map((item, index) => (
                        <li 
                          key={item.id}
                          className={`p-2 hover:bg-secondary cursor-pointer ${index === 0 ? 'bg-secondary border-l-2 border-accent' : ''}`}
                          onClick={() => handleSelectMaterial(item)}
                        >
                          <div className="flex items-center">
                            <span className="mr-2">
                              {item.type === 'folder' && '📁'}
                              {item.type === 'file' && '📄'}
                            </span>
                            <div>
                              <div className="font-medium text-text-primary">{item.name}</div>
                              <div className="text-xs text-text-secondary">{item.path?.join('/')}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex items-center bg-primary border border-secondary rounded-md overflow-hidden">
                <span className="text-lg font-medium px-2 text-text-secondary">@</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="flex-grow p-2 outline-none bg-transparent text-text-primary"
                  placeholder="Search files and folders..."
                  value={mentionSearchQuery}
                  onChange={handleSearchInputChange}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
            </div>
          )}

          {/* Message usage indicator */}
          {!hasExceededMessageLimit() && isSubscriptionActive() && getMessagesRemaining() <= 5 && (
            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <svg className="h-4 w-4 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.856-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-yellow-800 font-medium text-sm">Low message count</p>
                  <p className="text-yellow-700 text-xs">
                    {getMessagesRemaining()} messages remaining.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Message limit warning */}
          {hasExceededMessageLimit() && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.856-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-red-800 font-medium">Message limit reached</p>
                  <p className="text-red-700 text-sm">
                    You have used all {getCurrentMessageLimit()} messages allowed with your plan.
                    {getNextBillingDate() && (
                      <span> Your limit will reset on {getNextBillingDate()!.toLocaleDateString()}.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end">
            <textarea
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              placeholder={hasExceededMessageLimit() ? "Message limit reached" : "Ask a follow-up question..."}
              className="flex-1 bg-primary border border-secondary rounded-l-lg px-4 py-2 focus:outline-none focus:border-accent text-text-primary resize-none overflow-hidden min-h-[2.5rem] max-h-[10rem]"
              disabled={isLoading || hasExceededMessageLimit()}
              rows={1}
              style={{
                height: 'auto',
                minHeight: '2.5rem',
                maxHeight: '10rem'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 160) + 'px';
              }}
            />
            <button
              type="button"
              onClick={toggleMentionSearch}
              className="bg-secondary hover:bg-secondary-300 text-text-primary font-semibold px-4 py-2 transition-colors mention-trigger border border-secondary border-l-0 border-r-0 h-10"
              title="Add files or folders to context"
            >
              <span className="text-lg font-medium">@</span>
            </button>
            <button
              type="submit"
              disabled={isLoading || !message.trim() || hasExceededMessageLimit()}
              className={`bg-accent hover:bg-accent-300 text-primary font-semibold px-4 py-2 rounded-r-lg transition-colors h-10
                ${isLoading || !message.trim() || hasExceededMessageLimit() ? 'cursor-not-allowed opacity-50' : ''}`}
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
function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

export function LoadingIcon() {
  return (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}