'use client';

import { useChatStore } from '../store/chat';
import { formatTime } from '../lib/utils';

interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

interface MessageBubbleProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  references?: ChatReference[];
}

export default function MessageBubble({ id, role, content, timestamp, references }: MessageBubbleProps) {
  const { setCurrentReference } = useChatStore();
  
  const handleReferenceClick = (reference: ChatReference) => {
    setCurrentReference(reference);
  };

  const isUser = role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-lg p-4 ${
        isUser 
          ? 'bg-accent text-primary' 
          : 'bg-background-secondary text-text-primary'
      }`}>
        <div className="text-sm mb-1">{content}</div>
        
        {references && references.length > 0 && (
          <div className="mt-3 border-t border-secondary pt-2 space-y-2">
            <h4 className="text-xs font-semibold">References:</h4>
            {references.map((reference, index) => (
              <div 
                key={index}
                className="text-xs bg-primary p-2 rounded cursor-pointer hover:bg-primary-200 transition-colors"
                onClick={() => handleReferenceClick(reference)}
              >
                <div className="flex justify-between">
                  <span className="font-semibold">Page {reference.page}</span>
                </div>
                <div className="mt-1 text-secondary italic">{reference.text}</div>
              </div>
            ))}
          </div>
        )}
        
        <div className="text-right mt-1">
          <span className="text-xs opacity-70">{formatTime(timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
