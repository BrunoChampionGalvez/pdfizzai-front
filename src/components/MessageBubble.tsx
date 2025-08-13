'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useChatStore } from '../store/chat';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { formatTime } from '../lib/utils';
import { MentionedMaterial } from '../types/chat';
import { chatService } from '../services/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MaybeHttpError {
  response?: { status?: number };
  status?: number;
  code?: string | number;
}

// Helper: retry with exponential backoff for 429 errors
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 8000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      
      const e = error as MaybeHttpError;
      // Only retry on 429 (Too Many Requests) or network errors
      const is429 = e.response?.status === 429 || e.status === 429;
      const isNetworkError = !e.response && e.code !== 'ECONNABORTED';
      
      if (!is429 && !isNetworkError) {
        throw error; // Don't retry other errors
      }
      
      if (attempt === maxRetries) {
        break; // Max retries reached
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );
      
      console.log(`Request failed with ${e.response?.status ?? 'network error'}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Global request queue to ensure all extracted-content calls are sequential across all components
const globalRequestQueue = (() => {
  const queue: Array<() => Promise<unknown>> = [];
  let processing = false;

  const processQueue = async () => {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
      const task = queue.shift()!;
      try {
        await task();
      } catch (error) {
        console.error('Queue task failed:', error);
      }
      // Small delay between requests to be extra safe
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    processing = false;
  };

  return {
    enqueue: (task: () => Promise<unknown>) => {
      return new Promise((resolve, reject) => {
        queue.push(async () => {
          try {
            const result = await task();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
        processQueue();
      });
    }
  };
})();

// Deduplicated, sequential fetch helper for extracted-content
const inflightExtractedContent: Record<string, Promise<{ fileId: string; text: string; fileName: string }>> = {};
function getExtractedContentSequential(rawRefId: string, sessionId: string) {
  if (rawRefId in inflightExtractedContent) return inflightExtractedContent[rawRefId];
  const p = globalRequestQueue
    .enqueue(() => retryWithBackoff(() => chatService.getExtractedContentByRawRefId(rawRefId, sessionId)))
    .finally(() => {
      delete inflightExtractedContent[rawRefId];
    }) as Promise<{ fileId: string; text: string; fileName: string }>;
  inflightExtractedContent[rawRefId] = p;
  return p;
}

interface ChatReference {
  fileId: string;
  page: number;
  text: string;
}

/* numbering helpers removed in favor of session-scoped persistent numbering */

interface MessageBubbleProps {
  role: 'user' | 'model';
  firstContent: string;
  created_at: string;
  references?: ChatReference[];
  selectedMaterials?: MentionedMaterial[];
  isSidePanelMode?: boolean;
}

export default function MessageBubble({ 
  role,
  firstContent, 
  created_at, 
  references, 
  isSidePanelMode = false
}: MessageBubbleProps) {
  const { setCurrentReference, currentSessionId } = useChatStore();
  const { handleShowFile } = usePDFViewer();
  const [loadingRefAction, setLoadingRefAction] = useState<string | null>(null);
  const [filePaths, setFilePaths] = useState<Record<string, string>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [content, setContent] = useState<string>(firstContent || '');
  const processedIdsRef = useRef<Set<string>>(new Set());
  // Store mapping from rawRefId to text content for numbering
  const [refIdToText, setRefIdToText] = useState<Record<string, string>>({});
  // Store mapping from normalized text to assigned number (persisted per session)
  const [textToNumber, setTextToNumber] = useState<Record<string, number>>({});
  // Store mapping from rawRefId to fileId for reuse (avoid duplicate extracted-content calls)
  const [refIdToFileId, setRefIdToFileId] = useState<Record<string, string>>({});


  // // Helper: process requests in batches to avoid overwhelming backend
  // async function processBatchedRequests<T>(
  //   items: string[],
  //   processor: (item: string) => Promise<T>,
  //   batchSize: number = 3,
  //   delayMs: number = 100
  // ): Promise<Array<{ id: string; result: T | null }>> {
  //   const results: Array<{ id: string; result: T | null }> = [];

  //   for (let i = 0; i < items.length; i += batchSize) {
  //     const batch = items.slice(i, i + batchSize);

  //     // Process batch in parallel with retry logic
  //     const batchPromises = batch.map(async (item) => {
  //       try {
  //         const result = await retryWithBackoff(() => processor(item));
  //         return { id: item, result };
  //       } catch (error) {
  //         console.error(`Error processing ${item} after retries:`, error);
  //         return { id: item, result: null };
  //       }
  //     });

  //     const batchResults = await Promise.all(batchPromises);
  //     results.push(...batchResults);

  //     // Add delay between batches (except for the last batch)
  //     if (i + batchSize < items.length) {
  //       await new Promise((resolve) => setTimeout(resolve, delayMs));
  //     }
  //   }

  //   return results;
  // }

  // Helper: reference text cache in localStorage (namespaced by session)
  const getCacheKey = useCallback(() => {
    const sid = currentSessionId || 'global';
    return `refdoc_refTextMap_${sid}`;
  }, [currentSessionId]);
  const getRefTextCache = useCallback((): Record<string, string> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(getCacheKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [getCacheKey]);
  const setRefTextCache = useCallback((updates: Record<string, string>) => {
    if (typeof window === 'undefined') return;
    try {
      const current = getRefTextCache();
      const merged = { ...current, ...updates };
      localStorage.setItem(getCacheKey(), JSON.stringify(merged));
    } catch {
      // ignore cache errors
    }
  }, [getCacheKey, getRefTextCache]);

  // Helper: numbering cache in localStorage (namespaced by session)
  const getNumCacheKey = useCallback(() => {
    const sid = currentSessionId || 'global';
    return `refdoc_refNumMap_${sid}`;
  }, [currentSessionId]);
  const getNumNextKey = useCallback(() => {
    const sid = currentSessionId || 'global';
    return `refdoc_refNumNext_${sid}`;
  }, [currentSessionId]);
  const getRefNumCache = useCallback((): Record<string, number> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(getNumCacheKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [getNumCacheKey]);
  const setRefNumCache = useCallback((updates: Record<string, number>) => {
    if (typeof window === 'undefined') return;
    try {
      const current = getRefNumCache();
      const merged = { ...current, ...updates };
      localStorage.setItem(getNumCacheKey(), JSON.stringify(merged));
    } catch {
      // ignore cache errors
    }
  }, [getNumCacheKey, getRefNumCache]);
  const getNextCounter = useCallback((): number => {
    if (typeof window === 'undefined') return 1;
    const raw = localStorage.getItem(getNumNextKey());
    const n = raw ? parseInt(raw, 10) : 1;
    return isNaN(n) || n < 1 ? 1 : n;
  }, [getNumNextKey]);
  const setNextCounter = useCallback((n: number) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(getNumNextKey(), String(n));
  }, [getNumNextKey]);

  // Update content when firstContent prop changes (for streaming updates)
  useEffect(() => {
    setContent(firstContent || '');
  }, [firstContent]);

  // Parse content into segments preserving the order of text and references
  const parseContentIntoSegments = (content: string): Array<{ type: 'text' | 'reference'; content: string; tag?: { rawRefId?: string } }> => {
    const parts = content.split(/(\[REF\]|\[\/REF\])/);
    const segments: Array<{ type: 'text' | 'reference'; content: string; tag?: { rawRefId?: string } }> = [];
    let inReference = false;
    let currentRefSegment: { type: 'reference'; content: string; tag?: { rawRefId?: string } } | null = null;
    
    parts.forEach(part => {
      if (part === '[REF]') {
        inReference = true;
        currentRefSegment = { type: 'reference', content: '', tag: undefined };
        segments.push(currentRefSegment);
      } else if (part === '[/REF]') {
        inReference = false;
        if (currentRefSegment) {
          const contentToParse = currentRefSegment.content.trim();
          // New format: inside REF tags we only have the rawRefId as plain text
          if (contentToParse) {
            currentRefSegment.tag = { rawRefId: contentToParse };
          } else {
            currentRefSegment.tag = { rawRefId: undefined };
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
  
  // Collect reference rawRefIds in order of appearance
  const referenceRawIds = useMemo(() => {
    if (!content || role !== 'model') return [] as string[];
    const segments = parseContentIntoSegments(content);
    return segments
      .filter(segment => segment.type === 'reference' && segment.tag?.rawRefId)
      .map(segment => segment.tag!.rawRefId!) as string[];
  }, [content, role]);

  // When session changes, load number map from cache
  useEffect(() => {
    setTextToNumber(getRefNumCache());
  }, [currentSessionId, getRefNumCache]);

  // Clear all in-memory reference state when session changes to prevent cross-chat leakage
  useEffect(() => {
    // Clear all local state when switching sessions
    setRefIdToText({});
    setRefIdToFileId({});
    setFilePaths({});
    setLoadingPaths({});
    processedIdsRef.current.clear();
    
    // Load the session-specific number cache
    setTextToNumber(getRefNumCache());
  }, [currentSessionId, getRefNumCache]);

  // Load extracted content text for each rawRefId for numbering (with localStorage cache)
  useEffect(() => {
    if (referenceRawIds.length === 0) return;

    // Prime from cache synchronously
    const cache = getRefTextCache();
    const cached: Record<string, string> = {};
    const missing: string[] = [];
    for (const id of referenceRawIds) {
      if (refIdToText[id]) continue;
      if (cache[id]) {
        cached[id] = cache[id];
      } else {
        missing.push(id);
      }
    }
    if (Object.keys(cached).length > 0) {
      setRefIdToText(prev => ({ ...prev, ...cached }));
    }
    if (missing.length === 0) return;

    // Fetch the missing ones SEQUENTIALLY to avoid 429s
    (async () => {
      const textMapping: Record<string, string> = {};
      const fileIdMapping: Record<string, string> = {};

      // sort numerically by trailing digits (reference number) to maintain stable ordering
      const missingSorted = [...missing].sort((a, b) => {
        const na = parseInt(a.match(/(\d+)$/)?.[1] || '0', 10);
        const nb = parseInt(b.match(/(\d+)$/)?.[1] || '0', 10);
        return na - nb;
      });

      for (const rawRefId of missingSorted) {
        try {
          const extractedContent = await getExtractedContentSequential(rawRefId, currentSessionId || '');
          textMapping[rawRefId] = extractedContent.text;
          fileIdMapping[rawRefId] = extractedContent.fileId;
        } catch (error) {
          console.error(`Error fetching extracted content for ${rawRefId}:`, error);
        }
      }

      if (Object.keys(textMapping).length > 0) {
        setRefIdToText(prev => ({ ...prev, ...textMapping }));
        setRefTextCache(textMapping);
      }
      if (Object.keys(fileIdMapping).length > 0) {
        setRefIdToFileId(prev => ({ ...prev, ...fileIdMapping }));
      }
    })();
  }, [referenceRawIds, refIdToText, currentSessionId, getRefTextCache, setRefTextCache]);

  // Simple normalization to make deduplication more robust
  const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim();

  // Ensure numbers are assigned for all known texts (in order of appearance)
  useEffect(() => {
    if (referenceRawIds.length === 0) return;

    // Build ordered list of normalized texts for the visible message content
    const textsInOrder: string[] = [];
    for (const id of referenceRawIds) {
      const t = refIdToText[id];
      if (!t) continue; // wait until text is available
      const key = normalizeText(t);
      if (key && !textsInOrder.includes(key)) {
        textsInOrder.push(key);
      }
    }
    if (textsInOrder.length === 0) return;

    // Load existing caches
    const numMap = getRefNumCache();
    let next = getNextCounter();
    let changed = false;

    for (const key of textsInOrder) {
      if (numMap[key] == null) {
        numMap[key] = next;
        next += 1;
        changed = true;
      }
    }

    if (changed) {
      setRefNumCache(numMap);
      setNextCounter(next);
      setTextToNumber({ ...numMap });
    } else {
      // Ensure local state is in sync if it was empty
      if (Object.keys(textToNumber).length === 0 && Object.keys(numMap).length > 0) {
        setTextToNumber({ ...numMap });
      }
    }
  }, [referenceRawIds, refIdToText, currentSessionId, textToNumber, getRefNumCache, getNextCounter, setRefNumCache, setNextCounter]);

  // Load file paths for references when new reference IDs are found (we still support showing file path if needed)
  useEffect(() => {
    const timer = setTimeout(() => {
      const newIds = referenceRawIds.filter(id => 
        !filePaths[id] && 
        !loadingPaths[id] && 
        !processedIdsRef.current.has(id)
      );
      
      if (newIds.length === 0) return;
      newIds.forEach(id => processedIdsRef.current.add(id));
      setLoadingPaths(prev => ({ ...prev, ...Object.fromEntries(newIds.map(id => [id, true])) }));
      
      (async () => {
        const pathMapping: Record<string, string> = {};

        // Process one by one to ensure any extracted-content calls are sequential
        for (const id of newIds) {
          try {
            let fileId = refIdToFileId[id];
            if (!fileId) {
              // This will be called sequentially due to the for-loop
              const data = await getExtractedContentSequential(id, currentSessionId || '');
              fileId = data.fileId;
              setRefIdToFileId(prev => ({ ...prev, [id]: fileId }));
            }
            const path = await chatService.getFilePath(fileId);
            pathMapping[id] = path;
          } catch (error) {
            console.error(`Error resolving path for ${id}:`, error);
            pathMapping[id] = '[Error loading path]';
          }
        }

        setFilePaths(prev => ({ ...prev, ...pathMapping }));
        setLoadingPaths(prev => ({ ...prev, ...Object.fromEntries(newIds.map(id => [id, false])) }));
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [referenceRawIds, filePaths, loadingPaths, refIdToFileId, currentSessionId]);
  
  const handleShowFileWrapper = async (rawRefId: string) => {
    if (!rawRefId) {
      console.error('Invalid rawRefId provided to handleShowFile');
      return;
    }
    
    setLoadingRefAction(rawRefId);
    try {
      // First try to use cached data to avoid unnecessary API calls
      let fileId = refIdToFileId[rawRefId];
      let text = refIdToText[rawRefId];
      
      // Only make API call if we don't have the required data
      if (!fileId || !text) {
        console.log(`Missing cached data for ${rawRefId}, fetching from API...`);
        const data = await getExtractedContentSequential(rawRefId, currentSessionId || '');
        fileId = data.fileId;
        text = data.text;
        
        // Update caches
        setRefIdToFileId(prev => ({ ...prev, [rawRefId]: fileId }));
        setRefIdToText(prev => ({ ...prev, [rawRefId]: text }));
        setRefTextCache({ [rawRefId]: text });
      } else {
        console.log(`Using cached data for ${rawRefId}`);
      }
      
      // Set current reference in store
      setCurrentReference({ fileId, text, page: 1 });
      
      // Open PDF and highlight text
      await handleShowFile(fileId, text);
    } catch (error) {
      console.error('Error showing file for rawRefId:', error);
    } finally {
      setLoadingRefAction(null);
    }
  };

  // Render a numbered inline button for a reference
  const renderReferenceInlineButton = (rawRefId: string | undefined, key: number | string) => {
    if (!rawRefId) {
      return (
        <span key={`ref-${key}`} className="align-baseline ml-1 inline-flex items-center text-xs text-text-secondary">[?]</span>
      );
    }

    const textContent = refIdToText[rawRefId];
    const isOpening = loadingRefAction === rawRefId;

    // Show spinner while loading text or waiting for number assignment
    if (!textContent) {
      return (
        <span key={`ref-${key}`} className="ml-1 inline-flex items-center justify-center align-baseline h-5 min-w-[1.25rem] px-1 text-xs font-semibold bg-secondary text-text-primary border border-secondary rounded">
          <span className="w-3 h-3 border-2 border-text-primary border-t-transparent rounded-full animate-spin inline-block" />
        </span>
      );
    }

    const keyNorm = normalizeText(textContent);
    const number = textToNumber[keyNorm];

    if (!number) {
      return (
        <span key={`ref-${key}`} className="ml-1 inline-flex items-center justify-center align-baseline h-5 min-w-[1.25rem] px-1 text-xs font-semibold bg-secondary text-text-primary border border-secondary rounded">
          <span className="w-3 h-3 border-2 border-text-primary border-t-transparent rounded-full animate-spin inline-block" />
        </span>
      );
    }

    return (
      <button
        key={`ref-${key}`}
        type="button"
        className="ml-1 inline-flex items-center justify-center align-baseline h-5 min-w-[1.25rem] px-1 text-xs font-semibold bg-secondary text-text-primary border border-secondary rounded hover:bg-secondary-300 transition-colors cursor-pointer"
        onClick={() => handleShowFileWrapper(rawRefId)}
        onMouseDown={(e) => e.preventDefault()} // Prevent focus shift that could trigger scroll
        tabIndex={-1} // Make button non-focusable to prevent scroll-into-view
        disabled={isOpening}
        title={`Reference ${number}`}
      >
        {isOpening ? (
          <span className="w-3 h-3 border-2 border-text-primary border-t-transparent rounded-full animate-spin inline-block" />
        ) : (
          <span>{number}</span>
        )}
      </button>
    );
  };

  // Parse content and embed references inline within text
  const parseContentWithInlineReferences = (content: string) => {
    // Replace [REF]...[/REF] patterns with placeholder markers
    let processedContent = content;
    const refMatches: Array<{ rawRefId: string; placeholder: string }> = [];
    let refIndex = 0;
    
    processedContent = processedContent.replace(/\[REF\](.*?)\[\/REF\]/g, (match, rawRefId) => {
      const placeholder = `__REF_PLACEHOLDER_${refIndex}__`;
      refMatches.push({ rawRefId: rawRefId.trim(), placeholder });
      refIndex++;
      return placeholder;
    });
    
    return { processedContent, refMatches };
  };

  // Custom ReactMarkdown component to handle inline references
  const InlineReferenceText = ({ children }: { children: React.ReactNode }) => {
    const textContent = React.Children.toArray(children).join('');
    const { processedContent, refMatches } = parseContentWithInlineReferences(textContent);
    
    if (refMatches.length === 0) {
      return <>{children}</>;
    }
    
    // Split by placeholders and insert reference buttons
    const parts = processedContent.split(/(__REF_PLACEHOLDER_\d+__)/);
    
    return (
      <>
        {parts.map((part, index) => {
          const refMatch = refMatches.find(ref => ref.placeholder === part);
          if (refMatch) {
            return renderReferenceInlineButton(refMatch.rawRefId, `inline-${index}`);
          }
          return part;
        })}
      </>
    );
  };

  // Render content with inline numbered reference buttons
  const renderContentWithReferences = () => {
    if (!content) {
      if (role === 'model') {
        return (
          <div className="flex items-center space-x-3 py-3" key="loading-response">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            <div className="text-sm font-medium text-accent">Loading...</div>
          </div>
        );
      }
      return <div>No content</div>;
    }

    return (
      <div className="markdown-content w-full">
        <div className="prose prose-slate w-full max-w-full break-words overflow-hidden">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({...props}) => <ul className="list-disc pl-6 my-2 space-y-1" {...props} />,
              ol: ({...props}) => <ol className="list-decimal pl-6 my-2 space-y-1" {...props} />,
              li: ({children, ...props}: React.ComponentPropsWithoutRef<'li'>) => (
                <li className="my-1" {...props}>
                  <InlineReferenceText>{children}</InlineReferenceText>
                </li>
              ),
              code: ({ children, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
                return (
                  <code className="bg-secondary px-1 py-0.5 rounded text-sm font-mono" {...props}>
                    {children}
                  </code>
                );
              },
              p: ({children, ...props}: React.ComponentPropsWithoutRef<'p'>) => {
                const textContent = React.Children.toArray(children).join('').trim();
                if (!textContent) return <br />;
                return (
                  <p className="my-2 break-words" {...props}>
                    <InlineReferenceText>{children}</InlineReferenceText>
                  </p>
                );
              },
              h1: ({children, ...props}) => (
                <h1 className="text-2xl font-bold mt-6 mb-4" {...props}>
                  <InlineReferenceText>{children}</InlineReferenceText>
                </h1>
              ),
              h2: ({children, ...props}) => (
                <h2 className="text-xl font-bold mt-5 mb-3" {...props}>
                  <InlineReferenceText>{children}</InlineReferenceText>
                </h2>
              ),
              h3: ({children, ...props}) => (
                <h3 className="text-lg font-bold mt-4 mb-2" {...props}>
                  <InlineReferenceText>{children}</InlineReferenceText>
                </h3>
              ),
              em: ({children, ...props}) => (
                <em className="italic" {...props}>
                  <InlineReferenceText>{children}</InlineReferenceText>
                </em>
              ),
              strong: ({children, ...props}) => (
                <strong className="font-bold" {...props}>
                  <InlineReferenceText>{children}</InlineReferenceText>
                </strong>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  };

  const isUser = role === 'user';
  
  return (
    <div className={`w-full mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`${isSidePanelMode ? 'max-w-[90%]' : 'max-w-[70vw]'} min-w-[200px] rounded-lg p-4 ${
        isUser 
          ? 'bg-accent text-primary' 
          : 'bg-background-secondary text-text-primary'
      }`}>
        {renderContentWithReferences()}
        
        {/* Legacy references support */}
        {references && references.length > 0 && (
          <div className="mt-3 border-t border-secondary pt-2 space-y-2">
            <h4 className="text-xs font-semibold">References:</h4>
            {references.map((reference, index) => (
              <div 
                key={index}
                className="text-xs bg-primary p-2 rounded cursor-pointer hover:bg-primary-200 transition-colors"
                onClick={() => setCurrentReference(reference)}
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
          <span className="text-xs opacity-70">{formatTime(created_at)}</span>
        </div>
      </div>
    </div>
  );
}
