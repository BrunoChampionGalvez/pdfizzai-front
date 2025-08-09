'use client'; // Client-side only component for PDFjs Express

import WebViewer, { WebViewerInstance } from '@pdftron/pdfjs-express-viewer';
import { useEffect, useRef, useState, useCallback, useId } from 'react';
import api from '@/lib/api';
import PDFViewerManager from '@/lib/pdf-viewer-manager';

interface PdfViewerClientProps {
  pdfUrl: string | null;
  textSnippet?: string;
  paperId?: string | null;
  shouldExtractText?: boolean;
  onTextExtractionComplete?: (success: boolean) => void;
  onTextExtractionProgress?: (progress: number) => void;
}

export const PdfViewerClient = ({ 
  pdfUrl, 
  textSnippet = '',
  paperId, 
  shouldExtractText = false,
  onTextExtractionComplete,
  onTextExtractionProgress,
}: PdfViewerClientProps) => {
    const viewer = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const instanceRef = useRef<WebViewerInstance | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const uniqueId = useId(); // Generate a truly unique ID for this instance
    const elementId = useRef(`webviewer-${paperId || 'doc'}-${uniqueId}-${Date.now()}`); // Add timestamp for extra uniqueness
    const mountedRef = useRef<boolean>(true);
    const initializingRef = useRef<boolean>(false);
    
    // Clean up function to properly dispose WebViewer
    const cleanUpViewer = useCallback(async () => {
        console.log(`Attempting to clean up WebViewer instance: ${elementId.current}`);
        
        if (instanceRef.current) {
            try {
                console.log('Disposing WebViewer instance');
                instanceRef.current.UI.dispose();
                await new Promise(resolve => setTimeout(resolve, 100)); // Short delay after disposal
                instanceRef.current = null;
            } catch (err) {
                console.error('Error during WebViewer dispose:', err);
            }
        }
        
        // Unregister from our PDF viewer manager
        PDFViewerManager.unregisterViewer(elementId.current);
        
        // Clear the viewer element content
        if (viewer.current) {
            viewer.current.innerHTML = '';
        }
        
        setIsInitialized(false);
    }, []);

    // Function to extract text with batching
    const extractTextFromPdf = useCallback(async (instance: WebViewerInstance, paperIdToExtract: string) => {
        if (isExtracting) {
            console.log('Already extracting text, skipping duplicate call');
            return;
        }
        
        try {
            setIsExtracting(true);
            
            console.log('Starting text extraction for document');
            const documentViewer = instance.Core.documentViewer;
            const totalPages = await documentViewer.getPageCount();
            console.log(`Found ${totalPages} pages for extraction`);
            
            if (totalPages === 0) {
                console.error('No pages found in document');
                setIsExtracting(false);
                onTextExtractionComplete?.(false);
                return;
            }
            
            const doc = await documentViewer.getDocument();
            const batchSize = 10; // Process 10 pages at a time
            const batches = Math.ceil(totalPages / batchSize);
            let extractedText: string = '';
            
            for (let batch = 0; batch < batches; batch++) {
                // Calculate page range for this batch (1-indexed for PDF.js Express)
                const startPage = batch * batchSize + 1;
                const endPage = Math.min((batch + 1) * batchSize, totalPages);
                console.log(`Processing batch ${batch + 1}/${batches}: pages ${startPage}-${endPage}`);
                
                // Extract text for each page in batch
                for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                    try {
                        const text = await doc.loadPageText(pageNum);
                        extractedText += `[START_PAGE]${text}[END_PAGE]`;
                    } catch (error) {
                        console.error(`Error extracting text from page ${pageNum}, retrying...`, error);
                        
                        // Retry once with delay
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        try {
                            const text = await doc.loadPageText(pageNum);
                            extractedText += `[START_PAGE]${text}[END_PAGE]`;
                        } catch (retryError) {
                            console.error(`Failed to extract text from page ${pageNum} after retry`, retryError);
                            extractedText += `[START_PAGE][EXTRACTION_FAILED][END_PAGE]`;
                        }
                    }
                    
                    // Update progress
                    const progress = Math.round(((batch * batchSize) + (pageNum - startPage + 1)) / totalPages * 100);
                    onTextExtractionProgress?.(progress);
                }
            }
            
            // Send extracted text to backend
            console.log('Sending extracted text to backend');
            
            try {
                const response = await api.post(
                    `/api/files/${paperIdToExtract}/save-text`,
                    { 
                        textByPages: extractedText,
                        totalPages,
                    },
                    { 
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 30000 // 30 seconds timeout
                    }
                );
                
                console.log('Text extraction complete:', response);
                
                // Clear the active extraction
                PDFViewerManager.setActiveExtraction(null);
                
                onTextExtractionComplete?.(true);
            } catch (apiError) {
                console.error('API error saving extracted text:', apiError);
                onTextExtractionComplete?.(false);
                
                // Clear the active extraction on error too
                PDFViewerManager.setActiveExtraction(null);
            }
        } catch (error) {
            console.error('Error in text extraction process:', error);
            setIsExtracting(false);
            onTextExtractionComplete?.(false);
            
            // Clear the active extraction on any error
            PDFViewerManager.setActiveExtraction(null);
        }
    }, [isExtracting, onTextExtractionComplete, onTextExtractionProgress]);

    useEffect(() => {
        // Set mounted flag for tracking component lifecycle
        mountedRef.current = true;
        
        return () => {
            // Mark as unmounted to prevent state updates
            mountedRef.current = false;
            
            // Ensure cleanup happens on unmount
            cleanUpViewer();
        };
    }, [cleanUpViewer]);

    useEffect(() => {
        // Skip initialization if component is unmounting, already initializing,
        // or if we don't have the necessary prerequisites
        if (!mountedRef.current || initializingRef.current || !viewer.current || !pdfUrl) {
            console.log('Skipping WebViewer initialization - prerequisites not met', {
                mounted: mountedRef.current,
                initializing: initializingRef.current,
                hasViewer: !!viewer.current,
                hasPdfUrl: !!pdfUrl
            });
            return;
        }
        
        // Set initializing flag to prevent duplicate initializations
        initializingRef.current = true;
        
        // Setup initialization
        const initializeWebViewer = async () => {
            // Check if we're already initialized
            if (isInitialized || instanceRef.current) {
                console.log('WebViewer already initialized, skipping redundant initialization');
                initializingRef.current = false;
                return;
            }
            
            // Request initialization permission
            const canInitialize = await PDFViewerManager.requestInitialization(elementId.current);
            
            // Check if we can initialize and if the component is still mounted
            if (!canInitialize || !mountedRef.current) {
                console.log(`Cannot initialize WebViewer: permission denied or component unmounted`);
                PDFViewerManager.releaseInitializationLock();
                initializingRef.current = false;
                return;
            }
            
            try {
                console.log(`Initializing WebViewer with PDF URL: ${pdfUrl}`);
                
                // Create a new container to ensure a clean element
                if (viewer.current) {
                    // Clear any existing content
                    viewer.current.innerHTML = '';
                    
                    // Create a new div with a unique ID
                    const container = document.createElement('div');
                    container.id = elementId.current;
                    container.style.width = '100%';
                    container.style.height = '100%';
                    viewer.current.appendChild(container);
                    
                    // Register the viewer
                    PDFViewerManager.registerViewer(elementId.current);
                    
                    // Initialize WebViewer
                    WebViewer(
                        {
                            path: '/webviewer/lib',
                            initialDoc: pdfUrl,
                            extension: 'pdf',
                            licenseKey: process.env.NEXT_PUBLIC_PDFJS_EXPRESS_KEY,
                            disabledElements: shouldExtractText ? [
                                'leftPanelButton',
                                'searchButton', 
                                'menuButton',
                                'toolsButton',
                                'viewControlsButton'
                            ] : [],
                            enableFilePicker: false,
                        },
                        container // Use the new container
                    ).then((instance) => {
                        // Only update state if component is still mounted
                        if (!mountedRef.current) {
                            console.log('Component unmounted during WebViewer initialization, cleaning up');
                            try {
                                instance.UI.dispose();
                            } catch (err) {
                                console.error('Error disposing unmounted WebViewer:', err);
                            }
                            PDFViewerManager.unregisterViewer(elementId.current);
                            PDFViewerManager.releaseInitializationLock();
                            return;
                        }
                        
                        // Store the instance for cleanup later
                        instanceRef.current = instance;
                        setIsInitialized(true);
                        
                        console.log('WebViewer instance created successfully');
                        const { Core, UI } = instance;
                
                        // Event listener for document loaded
                        Core.documentViewer.addEventListener('documentLoaded', async () => {
                            // Check if component is still mounted
                            if (!mountedRef.current) return;
                            
                            console.log('Document loaded successfully');

                            // Set fitMode to fit width
                            const FitMode = UI.FitMode;
                            UI.setFitMode(FitMode.FitWidth);
                            
                            // Handle text search if snippets are provided
                            if (textSnippet) {
                                console.log('Processing text snippets for highlighting');
                                
                                try {
                                    // Replaces newlines with spaces, BUT only when NOT preceded by a hyphen
                                    const searchValue = textSnippet.replace(/(?<!-)[\r\n]+/g, ' ');
                                    // Removes whitespace (including newlines) that comes AFTER hyphens
                                    const newSearchValue = searchValue.replace(/-\s+/g, '-');
                                    // Removes hyphens that are NOT at the end of a line, but only if preceded by a number
                                    const newerSearchValue = newSearchValue.replace(/(\d)-+/g, '$1');
                                    if (newerSearchValue) {
                                        console.log('Searching for text');
                                        UI.searchText(newerSearchValue);
                                    }
                                } catch (err) {
                                    console.error('Error processing text snippets:', err);
                                }
                            }
                            
                            setError(null);
                            
                            // If shouldExtractText is true and we have a paperId, extract text
                            if (shouldExtractText && paperId && !isExtracting) {
                                console.log('Starting text extraction for document');
                                
                                // Register this as an active extraction
                                PDFViewerManager.setActiveExtraction(elementId.current);
                                
                                try {
                                    await extractTextFromPdf(instance, paperId);
                                } catch (err) {
                                    console.error('Error extracting text:', err);
                                    onTextExtractionComplete?.(false);
                                    
                                    // Clear active extraction
                                    PDFViewerManager.setActiveExtraction(null);
                                }
                            } else {
                                console.log('Text extraction not needed or already in progress');
                            }
                        });
        
                        // Event listener for page number updates
                        Core.documentViewer.addEventListener('pageNumberUpdated', (data?: unknown) => {
                            const pageNumber = (typeof data === 'number' ? data : 1);
                            console.log(`Page number is: ${pageNumber}`);
                        });
                        
                        // Handle errors
                        instance.Core.documentViewer.addEventListener('documentLoadingFailed', (err: unknown) => {
                            console.error('Document loading failed:', err);
                            const errorMessage = err instanceof Error ? err.message : 'Please check if the URL is correct.';
                            setError(`Failed to load PDF: ${errorMessage}`);
                        });
        
                        // Release the initialization lock now that we're done
                        PDFViewerManager.releaseInitializationLock();
                    }).catch((err: unknown) => {
                        console.error('Error initializing WebViewer:', err);
                        if (mountedRef.current) {
                            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                            setError(`Failed to initialize PDF viewer: ${errorMessage}`);
                        }
                        
                        // Clean up on initialization error
                        PDFViewerManager.unregisterViewer(elementId.current);
                        PDFViewerManager.releaseInitializationLock();
                        setIsInitialized(false);
                        initializingRef.current = false;
                    });
                } else {
                    console.error('Viewer ref is null during initialization');
                    PDFViewerManager.releaseInitializationLock();
                    initializingRef.current = false;
                }
            } catch (err) {
                console.error('Unexpected error during WebViewer initialization:', err);
                PDFViewerManager.releaseInitializationLock();
                initializingRef.current = false;
            }
        };

        // Initialize the viewer with a delay to ensure clean DOM state
        const timeoutId = setTimeout(() => {
            initializeWebViewer();
        }, 100);
        
        return () => {
            clearTimeout(timeoutId);
            
            // Release the initialization lock if we're cleaning up during initialization
            if (initializingRef.current) {
                PDFViewerManager.releaseInitializationLock();
                initializingRef.current = false;
            }
        };
    }, [pdfUrl, shouldExtractText, paperId, isExtracting, isInitialized, cleanUpViewer, textSnippet, onTextExtractionComplete, extractTextFromPdf]);
    

    return (
        <div className="PdfViewer" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            {error ? (
                <div className="flex items-center justify-center h-full w-full bg-gray-100 text-red-500 p-4">
                    <p>{error}</p>
                    <button 
                        className="ml-3 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        onClick={async () => {
                            setError(null);
                            await cleanUpViewer(); // Clean up first
                            initializingRef.current = false; // Reset initialization state
                            setIsInitialized(false); // Reset initialization state
                        }}
                    >
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    <div 
                        className="webviewer" 
                        ref={viewer}
                        style={{ flex: 1 }}
                    ></div>
                </>
            )}
        </div>
    );
};