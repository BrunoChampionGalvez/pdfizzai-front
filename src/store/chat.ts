import { create } from 'zustand';
import { MentionedMaterial } from '../types/chat';

interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

// Add this type for the parameter
interface PartialChatReference {
  fileId?: string;
  page?: number;
  text?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
  references?: ChatReference[];
  selectedMaterials?: MentionedMaterial[];
}

interface ChatSession {
  id: string;
  created_at: string;
}

interface ChatState {
  currentSessionId: string | null;
  messages: ChatMessage[];
  sessions: ChatSession[];
  isLoading: boolean;
  isChatPaneCollapsed: boolean;
  currentReference: ChatReference | null;
  
  setCurrentSessionId: (sessionId: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, content: string) => void;
  updateMessageContent: (messageId: string, additionalContent: string) => void;
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  setLoading: (loading: boolean) => void;
  setChatPaneCollapsed: (collapsed: boolean) => void;
  setCurrentReference: (reference: PartialChatReference | null) => void;
  clearMessages: () => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  currentSessionId: null,
  messages: [],
  sessions: [],
  isLoading: false,
  isChatPaneCollapsed: false,
  currentReference: null,
  
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (messageId, content) => set((state) => ({
    messages: state.messages.map(msg => 
      msg.id === messageId ? { ...msg, content } : msg
    )
  })),
  updateMessageContent: (messageId, additionalContent) => set((state) => ({
    messages: state.messages.map(msg => 
      msg.id === messageId ? { ...msg, content: msg.content + additionalContent } : msg
    )
  })),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),
  setLoading: (isLoading) => set({ isLoading }),
  setChatPaneCollapsed: (isChatPaneCollapsed) => set({ isChatPaneCollapsed }),
  setCurrentReference: (reference) => set({
    // Convert the partial reference to a full reference or null
    currentReference: reference ? {
      fileId: reference.fileId || '',
      page: reference.page || 1,
      text: reference.text || ''
    } : null
  }),
  clearMessages: () => set({ messages: [] }),
  clearAll: () => set({ 
    currentSessionId: null,
    messages: [],
    sessions: [],
    isLoading: false,
    isChatPaneCollapsed: false,
    currentReference: null
  }),
}));
