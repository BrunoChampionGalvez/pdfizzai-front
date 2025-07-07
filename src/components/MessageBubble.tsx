'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useChatStore } from '../store/chat';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { formatTime } from '../lib/utils';
import { MentionedMaterial } from '../types/chat';
import { chatService } from '../services/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

interface ReferenceTag {
  id: string;
  text: string;
}

interface MessageBubbleProps {
  id: string;
  role: 'user' | 'assistant';
  firstContent: string;
  timestamp: string;
  references?: ChatReference[];
  selectedMaterials?: MentionedMaterial[];
}

export default function MessageBubble({ 
  role,
  id,
  firstContent, 
  timestamp, 
  references, 
  selectedMaterials 
}: MessageBubbleProps) {
  const { setCurrentReference } = useChatStore();
  const { handleShowFile } = usePDFViewer();
  const [showMentions, setShowMentions] = useState(false);
  const [loadingRefAction, setLoadingRefAction] = useState<string | null>(null);
  const [filePaths, setFilePaths] = useState<Record<string, string>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [content, setContent] = useState<string>(firstContent || '');

  // Update content when firstContent prop changes (for streaming updates)
  useEffect(() => {
    setContent(firstContent || '');
  }, [firstContent]);

  // Parse content into segments preserving the order of text and references
  const parseContentIntoSegments = (content: string): Array<{ type: 'text' | 'reference'; content: string; tag?: ReferenceTag }> => {
    const parts = content.split(/(\[REF\]|\[\/REF\])/);
    const segments: Array<{ type: 'text' | 'reference'; content: string; tag?: ReferenceTag }> = [];
    let inReference = false;
    let currentRefSegment: { type: 'reference'; content: string; tag?: ReferenceTag } | null = null;
    
    parts.forEach(part => {
      if (part === '[REF]') {
        inReference = true;
        currentRefSegment = { type: 'reference', content: '', tag: undefined };
        segments.push(currentRefSegment);
      } else if (part === '[/REF]') {
        inReference = false;
        if (currentRefSegment) {
          const contentToParse = currentRefSegment.content.trim();
          
          try {
            if (!contentToParse) {
              currentRefSegment.tag = { id: 'empty_ref_content', text: '' } as ReferenceTag;
            } else {
              currentRefSegment.tag = JSON.parse(contentToParse);
              
              if (typeof currentRefSegment.tag !== 'object' || currentRefSegment.tag === null) {
                currentRefSegment.tag = { id: 'parse_error_non_object', text: '' } as ReferenceTag;
              }
            }
          } catch (e: unknown) {
            currentRefSegment.tag = { id: 'parse_error', text: '' } as ReferenceTag;
          }
        }
        currentRefSegment = null;
      } else {
        if (inReference && currentRefSegment) {
          currentRefSegment.content += part;
        } else {
          if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
            segments[segments.length - 1].content += part;
          } else {
            segments.push({ type: 'text', content: part });
          }
        }
      }
    });
    
    return segments;
  };
  
  // Memoize reference IDs to avoid re-running effect on every content change
  const referenceIds = useMemo(() => {
    if (!content || role !== 'assistant') return [];
    
    const segments = parseContentIntoSegments(content);
    return segments
      .filter(segment => segment.type === 'reference' && segment.tag?.id)
      .map(segment => segment.tag!.id);
  }, [content, role]);
  
  // Load file paths for references when new reference IDs are found
  useEffect(() => {
    const newReferenceIds = referenceIds.filter(id => !filePaths[id] && !loadingPaths[id]);
    
    if (newReferenceIds.length === 0) return;
    
    // Mark IDs as loading
    const newLoadingPaths = { ...loadingPaths };
    newReferenceIds.forEach(id => {
      newLoadingPaths[id] = true;
    });
    setLoadingPaths(newLoadingPaths);
    
    // Load paths for all new reference IDs
    Promise.all(
      newReferenceIds.map(async (id) => {
        try {
          const path = await chatService.getFilePath(id);
          return { id, path };
        } catch (error) {
          console.error(`Error loading path for ${id}:`, error);
          return { id, path: '[Error loading path]' };
        }
      })
    ).then(results => {
      setFilePaths(prev => {
        const newFilePaths = { ...prev };
        results.forEach(({ id, path }) => {
          newFilePaths[id] = path;
        });
        return newFilePaths;
      });
      
      setLoadingPaths(prev => {
        const newLoadingPathsUpdate = { ...prev };
        results.forEach(({ id }) => {
          newLoadingPathsUpdate[id] = false;
        });
        return newLoadingPathsUpdate;
      });
    });
  }, [referenceIds, filePaths, loadingPaths]); // Depend on the memoized referenceIds
  
  const handleReferenceClick = async (reference: ChatReference) => {
    // Set the current reference in the chat store for layout management
    setCurrentReference(reference);
    
    // Show the file in the PDF viewer with the specific text snippet
    await handleShowFile(reference.fileId, reference.text);
  };

  const handleShowFileWrapper = async (fileId: string, textSnippet: string) => {
    if (!fileId) {
      console.error('Invalid file ID provided to handleShowFile');
      return;
    }

    setLoadingRefAction(fileId);
    
    try {
      // Set the current reference in the chat store for layout management
      setCurrentReference({ fileId, text: textSnippet, page: 1 });
      
      // Show the file in the PDF viewer with the specific text snippet
      await handleShowFile(fileId, textSnippet);
    } catch (error) {
      console.error('Error showing file:', error);
    } finally {
      setLoadingRefAction(null);
    }
  };

  const handleLoadReferenceAgain = async (referenceId: string, textSnippet: string) => {
    setLoadingRefAction(referenceId);
    
    try {
      const result = await chatService.loadReferenceAgain(id, textSnippet, content);
      setContent(result)
    } catch (error) {
      console.error('Error loading reference again:', error);
      alert('Failed to load reference content. Please try again.');
    } finally {
      setLoadingRefAction(null);
    }
  };

  // Render a reference tag
  const renderReferenceTag = (tag: ReferenceTag, index: number | string) => {
    const baseClasses = "mt-2 mb-3 p-3 border rounded-md";
    const isLoading = loadingRefAction === tag.id;

    const path = filePaths[tag.id] || (loadingPaths[tag.id] ? 'Loading...' : 'Path not found');
    
    return (
      <div className='ml-2 flex' key={`ref-${index}`}>
        <div className='mr-2 min-w-[1rem] w-4 flex-shrink-0 h-6 border-l-2 border-b-2 border-accent-300 rounded-bl-md'></div>
        <div className={`${baseClasses} flex-grow bg-accent-100 border-accent-300 border-l-4`}>
          <div className="flex justify-between">
            <div className="text-xs text-accent-300 font-semibold">File path: {path}</div>
          </div>
          <div className="text-sm text-text-secondary mt-1">
            {tag.text && <><span className="font-semibold">Reference:</span> {tag.text}</> }
          </div>
          
          <div className="mt-2 space-y-2">
            <button 
              className="w-full px-3 py-2 bg-accent-200 text-primary rounded hover:bg-accent-300 transition-colors text-sm font-medium cursor-pointer"
              onClick={() => handleShowFileWrapper(tag.id, tag.text || '')}
              disabled={isLoading}
            >
              {isLoading && loadingRefAction === tag.id ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span>Loading...</span>
                </div>
              ) : 'Show File'}
            </button>
            
            <button 
              className="w-full px-3 py-2 bg-secondary text-text-primary border border-secondary rounded hover:bg-secondary-300 transition-colors text-sm font-medium cursor-pointer"
              onClick={() => handleLoadReferenceAgain(tag.id, tag.text || '')}
              disabled={isLoading}
            >
              {isLoading && loadingRefAction === `load-${tag.id}` ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-text-primary border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span>Loading...</span>
                </div>
              ) : 'Load Reference Again'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render content with reference tags
  const renderContentWithReferences = () => {
    if (!content) {
      if (role === 'assistant') {
        return (
          <div className="mt-2 mb-3 p-3 border rounded-md bg-secondary" key="loading-response">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-text-secondary border-t-transparent rounded-full animate-spin"></div>
              <div className="text-sm font-medium text-text-secondary">Loading response...</div>
            </div>
          </div>
        );
      }
      return <div>No content</div>;
    }

    // Parse content into segments preserving original order
    const segments = parseContentIntoSegments(content);

    return (
      <div className="markdown-content w-full">
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            const contentToRender = segment.content.trim();
            return (
              <div key={`text-${index}`} className="prose prose-slate w-full max-w-full break-words overflow-hidden">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    ul: ({...props}) => <ul className="list-disc pl-6 my-2 space-y-1" {...props} />,
                    ol: ({...props}) => <ol className="list-decimal pl-6 my-2 space-y-1" {...props} />,
                    li: ({...props}) => <li className="my-1" {...props} />,
                    code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
                      return (
                        <code className="bg-secondary px-1 py-0.5 rounded text-sm font-mono" {...props}>
                          {children}
                        </code>
                      );
                    },
                    p: ({children, ...props}: React.ComponentPropsWithoutRef<'p'>) => {
                      const textContent = React.Children.toArray(children).join('').trim();
                      if (!textContent) return <br />;
                      return <p className="my-2 break-words" {...props}>{children}</p>;
                    },
                    h1: ({...props}) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
                    h2: ({...props}) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
                    h3: ({...props}) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
                    em: ({...props}) => <em className="italic" {...props} />,
                    strong: ({...props}) => <strong className="font-bold" {...props} />,
                  }}
                >
                  {contentToRender}
                </ReactMarkdown>
              </div>
            );
          } else if (segment.type === 'reference') {
            if (segment.tag) {
              return renderReferenceTag(segment.tag, index);
            } else {
              return (
                <div key={`ref-streaming-${index}`} className="mt-2 mb-3 p-3 border rounded-md bg-accent-50 border-accent">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm font-medium text-accent">
                      Loading reference...
                    </div>
                  </div>
                </div>
              );
            }
          }
          return null;
        })}
      </div>
    );
  };

  const isUser = role === 'user';
  
  return (
    <div className="w-full mb-4">
      <div className={`w-full rounded-lg p-4 ${
        isUser 
          ? 'bg-accent text-primary' 
          : 'bg-background-secondary text-text-primary'
      }`}>
        {renderContentWithReferences()}
        
        {/* Show "See mentions" dropdown for user messages with selected materials */}
        {isUser && selectedMaterials && selectedMaterials.length > 0 && (
          <div className="mt-2 mb-1">
            <button 
              onClick={() => setShowMentions(!showMentions)}
              className={`flex items-center text-xs ${isUser ? 'text-primary-200' : 'text-accent'} hover:underline focus:outline-none`}
            >
              <span>See mentions</span>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-3 w-3 ml-1 transition-transform duration-200 ${showMentions ? 'transform rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Materials dropdown */}
            {showMentions && (
              <div className="mt-1.5 p-2 bg-primary rounded-md">
                <div className="flex flex-wrap gap-1">
                  {selectedMaterials.map(material => (
                    <div 
                      key={material.id} 
                      className="inline-flex items-center bg-accent-100 text-accent px-2 py-1 rounded-md text-xs"
                    >
                      <span className="mr-1">
                        {material.type === 'folder' && '📁'}
                        {material.type === 'file' && '📄'}
                      </span>
                      <span>{material.displayName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Legacy references support */}
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
