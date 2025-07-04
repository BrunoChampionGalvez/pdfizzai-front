import { create } from 'zustand';

interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  references?: ChatReference[];
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
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  setLoading: (loading: boolean) => void;
  setChatPaneCollapsed: (collapsed: boolean) => void;
  setCurrentReference: (reference: ChatReference | null) => void;
  clearMessages: () => void;
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
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),
  setLoading: (isLoading) => set({ isLoading }),
  setChatPaneCollapsed: (isChatPaneCollapsed) => set({ isChatPaneCollapsed }),
  setCurrentReference: (currentReference) => set({ currentReference }),
  clearMessages: () => set({ messages: [] }),
}));
