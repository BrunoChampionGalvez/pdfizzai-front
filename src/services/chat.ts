import api from '../lib/api';

export interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  referenced_file_id?: string;
  referenced_page?: number;
  referenced_text_snippet?: string;
}

export interface ChatSession {
  id: string;
  created_at: string;
}

export interface ChatResponse {
  reply: string;
  references: ChatReference[];
}

export const chatService = {
  async createSession(sessionName?: string): Promise<ChatSession> {
    const response = await api.post('/api/chat/start', { sessionName });
    return response.data;
  },

  async sendMessage(sessionId: string, message: string): Promise<ChatResponse> {
    const response = await api.post(`/api/chat/${sessionId}/message`, { message });
    return response.data;
  },

  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    const response = await api.get(`/api/chat/${sessionId}/history`);
    return response.data;
  },

  async getUserSessions(): Promise<ChatSession[]> {
    const response = await api.get('/api/chat/sessions');
    return response.data;
  },
};
