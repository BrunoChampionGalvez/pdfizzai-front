import api from '../lib/api';
import { extractErrorMessage, isAuthError, isError } from '../types/errors';

export interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
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

export interface SendMessagePayload {
  content: string;
  fileIds?: string[];
  folderIds?: string[];
  selectedMaterials?: any[];
}

export const chatService = {
  async createSession(sessionName?: string): Promise<ChatSession> {
    const response = await api.post('/api/chat/start', { sessionName });
    return response.data;
  },

  // Generator function for streaming messages
  async* sendMessageStream(sessionId: string, message: string, fileIds?: string[], folderIds?: string[], selectedMaterials?: any[]): AsyncGenerator<string, ChatResponse, unknown> {
    const payload: SendMessagePayload = { content: message };
    if (fileIds && fileIds.length > 0) {
      payload.fileIds = fileIds;
    }
    if (folderIds && folderIds.length > 0) {
      payload.folderIds = folderIds;
    }
    if (selectedMaterials && selectedMaterials.length > 0) {
      payload.selectedMaterials = selectedMaterials;
    }
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat/${sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Include cookies in the request for authentication
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Handle HTTP errors
        if (response.status === 401) {
          console.error('Authentication failed. Please log in again.');
          throw new Error('Session expired. Please log in again.');
        }
        
        if (response.status === 429) {
          console.error('Rate limit exceeded. Please wait before sending another message.');
          throw new Error('Too many requests. Please wait a moment before sending another message.');
        }
        
        // Try to parse error message from response
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        } catch (parseError) {
          // If we can't parse the error response, use status code
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let streamedContent = '';
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                console.log('[STREAMING] Received [DONE] signal');
                break;
              }
              
              // Skip empty data lines
              if (!data) {
                continue;
              }
              
              try {
                const parsedData = JSON.parse(data);
                if (parsedData.error) {
                  throw new Error(parsedData.error);
                }
                // Yield each chunk as it arrives for real-time streaming
                streamedContent += parsedData;
                console.log('[STREAMING] Yielding chunk:', parsedData.substring(0, 50) + '...');
                yield parsedData;
              } catch (error) {
                // If it's not JSON, treat as text chunk
                console.log('[STREAMING] Non-JSON chunk:', data.substring(0, 50) + '...');
                streamedContent += data;
                yield data;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        console.log('[STREAMING] Stream completed, total content length:', streamedContent.length);
      }

      // Parse references from the final content
      const references: ChatReference[] = [];
      const refMatches = streamedContent.match(/\[REF\]([\s\S]*?)\[\/REF\]/gi);
      if (refMatches) {
        refMatches.forEach(match => {
          try {
            const content = match.replace(/\[REF\]([\s\S]*?)\[\/REF\]/i, '$1').trim();
            const parsed = JSON.parse(content);
            references.push(parsed);
          } catch (error) {
            console.warn('Failed to parse reference:', match, error);
          }
        });
      }

      return {
        reply: streamedContent,
        references
      };
    } catch (error: unknown) {
      console.error('Failed to send message', error);
      if (isError(error)) {
        throw error;
      } else {
        throw new Error(extractErrorMessage(error));
      }
    }
  },

  async sendMessage(sessionId: string, message: string, fileIds?: string[], folderIds?: string[]): Promise<ChatResponse> {
    // Legacy non-streaming version for backward compatibility
    let streamedContent = '';
    const references: ChatReference[] = [];
    
    for await (const chunk of this.sendMessageStream(sessionId, message, fileIds, folderIds)) {
      streamedContent += chunk;
    }
    
    // Parse references from the final content
    const refMatches = streamedContent.match(/\[REF\]([\s\S]*?)\[\/REF\]/gi);
    if (refMatches) {
      refMatches.forEach(match => {
        try {
          const content = match.replace(/\[REF\]([\s\S]*?)\[\/REF\]/i, '$1').trim();
          const parsed = JSON.parse(content);
          references.push(parsed);
        } catch (error) {
          console.warn('Failed to parse reference:', match, error);
        }
      });
    }

    return {
      reply: streamedContent,
      references
    };
  },

  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const response = await api.get(`/api/chat/${sessionId}/history`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to get chat history:', error);
      if (isAuthError(error)) {
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(extractErrorMessage(error));
    }
  },

  async getUserSessions(): Promise<ChatSession[]> {
    try {
      const response = await api.get('/api/chat/sessions');
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to get user sessions:', error);
      if (isAuthError(error)) {
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(extractErrorMessage(error));
    }
  },

  async loadReferenceAgain(referenceId: string, messageId: string, textToSearch: string, chatMessage: string): Promise<string> {
    console.log('Inside searchReferenceAgain Service');
    
    const response = await api.post<string>(`/api/chat/load-reference-again/${messageId}`, {
      textToSearch,
      chatMessage,
      referenceId,
    });
    
    return response.data;
  },

  async getFilePath(id: string): Promise<string> {
    console.log('Inside getReferencePath Service');
    
    const response = await api.get<{ path: string }>(`/api/chat/reference-path/${id}`);
    return response.data.path;
  },
};
