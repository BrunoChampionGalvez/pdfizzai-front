'use client';

import { useEffect, useRef, useState } from 'react';
import WebViewer from '@pdftron/pdfjs-express-viewer';
import api from '@/lib/api';
import PDFViewerManager from '@/lib/pdf-viewer-manager';

interface PdfExtractorProps {
  fileId: string;
  fileUrl: string;
  onExtractionComplete: (success: boolean) => void;
  onExtractionProgress?: (progress: number) => void;
}

// Keep track of active WebViewer instances to prevent duplication
const activeInstances = new Set<string>();
// Keep track of active extractions to prevent duplicate extractions
const activeExtractions = new Set<string>();
// Track extraction completion status (needed to avoid race conditions)
const completedExtractions = new Set<string>();

export const PdfExtractor: React.FC<PdfExtractorProps> = ({
  fileId,
  fileUrl,
  onExtractionComplete,
  onExtractionProgress,
}) => {
  console.log(`[PDF Extractor] Component created with props:`, {
    fileId,
    fileUrl,
    fileUrlType: typeof fileUrl,
    fileUrlLength: fileUrl?.length
  });
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const uniqueIdRef = useRef(`pdf-extractor-${fileId}-${Date.now()}`);
  const extractionStatusRef = useRef<'not-started' | 'in-progress' | 'completed' | 'failed'>('not-started');
  const hasAttemptedInitRef = useRef(false);
  const extractionAttemptedRef = useRef(false);
  const mountedRef = useRef<boolean>(true);
  const initializingRef = useRef<boolean>(false);

  // Reset the global state for this file when the component mounts
  useEffect(() => {
    console.log(`[PDF Extractor] Component mounting for file ${fileId}`);
    // Set the mounted flag to true
    mountedRef.current = true;
    
    // If this file was previously marked as completed, clear that state
    if (completedExtractions.has(fileId)) {
      console.log(`[PDF Extractor] Clearing completed status for file ${fileId}`);
      completedExtractions.delete(fileId);
    }

    return () => {
      console.log(`[PDF Extractor] Component unmounting for file ${fileId}`);
      // If the component unmounts without extraction completing, clean up the extraction state
      if (activeExtractions.has(fileId) && extractionStatusRef.current !== 'completed') {
        console.log(`[PDF Extractor] Removing file ${fileId} from active extractions on unmount`);
        activeExtractions.delete(fileId);
      }

      // Mark component as unmounted
      mountedRef.current = false;
    };
  }, [fileId]);

  // Check for duplicate extraction attempts but don't auto-complete
  useEffect(() => {
    if (activeExtractions.has(fileId)) {
      console.log(`[PDF Extractor] File ${fileId} is already being extracted elsewhere`);
      // Don't auto-complete, allow this instance to try extraction 
      // in case the other instance failed but didn't clean up
    }
  }, [fileId, onExtractionComplete]);
  
  // Initialize the viewer once
  useEffect(() => {
    if (hasAttemptedInitRef.current || initializingRef.current) {
      console.log(`[PDF Extractor] Already attempted initialization for ${fileId}, skipping`);
      return;
    }
    
    hasAttemptedInitRef.current = true;
    initializingRef.current = true;
    
    // Create a unique ID for tracking this instance
    const instanceId = uniqueIdRef.current;
    
    // Begin initialization process
    const initializeExtractor = async () => {
      // Request initialization permission
      const canInitialize = await PDFViewerManager.requestInitialization(instanceId);
      
      // Check if we can initialize and component is still mounted
      if (!canInitialize || !mountedRef.current) {
        console.log(`[PDF Extractor] Cannot initialize: permission denied or component unmounted`);
        PDFViewerManager.releaseInitializationLock();
        initializingRef.current = false;
        return;
      }
      
      // Register with our manager
      if (!PDFViewerManager.registerViewer(instanceId)) {
        console.log(`[PDF Extractor] Instance ${instanceId} is already registered, skipping initialization`);
        PDFViewerManager.releaseInitializationLock();
        initializingRef.current = false;
        return;
      }
      
      // Register as the active extraction
      PDFViewerManager.setActiveExtraction(instanceId);
      
      // Check if DOM element is available
      if (!viewerRef.current || !mountedRef.current) {
        console.log('[PDF Extractor] Viewer ref not available yet or component unmounted');
        PDFViewerManager.unregisterViewer(instanceId);
        PDFViewerManager.setActiveExtraction(null);
        PDFViewerManager.releaseInitializationLock();
        initializingRef.current = false;
        
        if (mountedRef.current) {
          onExtractionComplete(false);
        }
        return;
      }
      
      try {
        // Clear existing content and prepare new container
        viewerRef.current.innerHTML = '';
        const container = document.createElement('div');
        container.id = `container-${instanceId}`;
        container.style.width = '100%';
        container.style.height = '100%';
        viewerRef.current.appendChild(container);
        
        // Initialize WebViewer
        if (isInitialized || instanceRef.current) {
          console.log('[PDF Extractor] Already initialized, skipping duplicate initialization');
          PDFViewerManager.releaseInitializationLock();
          initializingRef.current = false;
          return;
        }
        
        console.log('[PDF Extractor] Initializing viewer for extraction', fileId, fileUrl);
        
        // Use the direct file URL since Google Cloud Storage files are publicly accessible
        console.log('[PDF Extractor] Using direct file URL:', fileUrl);
        
        WebViewer(
          {
            path: '/webviewer/lib',
            initialDoc: fileUrl, // Use direct URL instead of proxy
            extension: 'pdf',
            licenseKey: 'w8JCA73N5p1Calk1TAl1',
            disabledElements: [
              'leftPanelButton',
              'searchButton',
              'menuButton',
              'toolsButton',
              'viewControlsButton',
            ],
            enableFilePicker: false,
          },
          container
        ).then(instance => {
          // Check if component is still mounted
          if (!mountedRef.current) {
            console.log('[PDF Extractor] Component unmounted during WebViewer initialization');
            try {
              instance.UI.dispose();
            } catch (err) {
              console.error('[PDF Extractor] Error disposing WebViewer for unmounted component:', err);
            }
            
            PDFViewerManager.unregisterViewer(instanceId);
            PDFViewerManager.setActiveExtraction(null);
            PDFViewerManager.releaseInitializationLock();
            initializingRef.current = false;
            return;
          }
          
          instanceRef.current = instance;
          setIsInitialized(true);
          console.log('[PDF Extractor] WebViewer instance created successfully');
          
          // Release initialization lock now that we're done with setup
          PDFViewerManager.releaseInitializationLock();
          initializingRef.current = false;
          
          // Add event listener for document loaded
          instance.Core.documentViewer.addEventListener('documentLoaded', async () => {
            console.log('[PDF Extractor] Document loaded, ready for extraction');
            
            // Only extract once and make sure we're not attempting to extract again after completion
            if (extractionStatusRef.current === 'not-started' && !extractionAttemptedRef.current) {
              extractionAttemptedRef.current = true;
              extractionStatusRef.current = 'in-progress';
              
              // Now add to active extractions to prevent duplicates
              if (!activeExtractions.has(fileId)) {
                console.log(`[PDF Extractor] Adding file ${fileId} to active extractions`);
                activeExtractions.add(fileId);
              }
              
              // Start extraction immediately
              console.log('[PDF Extractor] Starting text extraction automatically after document loaded');
              await extractText(instance);
            } else {
              console.log(`[PDF Extractor] Extraction already ${extractionStatusRef.current}, skipping`);
            }
          });
          
          instance.Core.documentViewer.addEventListener('documentLoadingFailed', (err: any) => {
            console.error('[PDF Extractor] Document loading failed:', err);
            setError(`Failed to load PDF: ${err?.message || 'Unknown error'}`);
            extractionStatusRef.current = 'failed';
            if (activeExtractions.has(fileId)) {
              activeExtractions.delete(fileId);
            }
            onExtractionComplete(false);
          });
        }).catch(err => {
          console.error('[PDF Extractor] WebViewer initialization failed:', err);
          setError(`Failed to initialize PDF viewer: ${err?.message || 'Unknown error'}`);
          extractionStatusRef.current = 'failed';
          if (activeExtractions.has(fileId)) {
            activeExtractions.delete(fileId);
          }
          
          // Clean up on error
          PDFViewerManager.unregisterViewer(instanceId);
          PDFViewerManager.setActiveExtraction(null);
          PDFViewerManager.releaseInitializationLock();
          initializingRef.current = false;
          
          if (mountedRef.current) {
            onExtractionComplete(false);
          }
        });
      } catch (error) {
        console.error('[PDF Extractor] Error during WebViewer setup:', error);
        
        if (activeExtractions.has(fileId)) {
          activeExtractions.delete(fileId);
        }
        
        PDFViewerManager.unregisterViewer(instanceId);
        PDFViewerManager.setActiveExtraction(null);
        PDFViewerManager.releaseInitializationLock();
        initializingRef.current = false;
        
        if (mountedRef.current) {
          onExtractionComplete(false);
        }
      }
    };
    
    // Start initialization with a short delay
    setTimeout(() => {
      initializeExtractor();
    }, 200);
    
    // Cleanup function
    return () => {
      if (instanceRef.current) {
        try {
          console.log('[PDF Extractor] Cleaning up WebViewer instance');
          instanceRef.current.UI.dispose();
          instanceRef.current = null;
        } catch (err) {
          console.error('[PDF Extractor] Error during WebViewer cleanup:', err);
        }
      }
      
      // Release initialization lock if we're unmounting during initialization
      if (initializingRef.current) {
        PDFViewerManager.releaseInitializationLock();
        initializingRef.current = false;
      }
      
      // Unregister from our manager
      PDFViewerManager.unregisterViewer(instanceId);
      
      // If this was the active extraction, clear it
      if (PDFViewerManager.getActiveExtraction() === instanceId) {
        PDFViewerManager.setActiveExtraction(null);
      }
      
      // Clear from active instances set
      activeInstances.delete(instanceId);
      console.log(`[PDF Extractor] Removed instance ${instanceId} from active instances`);

      // Clear the viewer element
      if (viewerRef.current) {
        viewerRef.current.innerHTML = '';
      }
    };
  }, [fileId, fileUrl, isInitialized, onExtractionComplete]);
  
  // Function to extract text
  const extractText = async (instance: any) => {
    if (isExtracting) {
      console.log('[PDF Extractor] Already extracting text, skipping duplicate call');
      return;
    }
    
    // Check if extraction was already completed for this file
    if (completedExtractions.has(fileId)) {
      console.log(`[PDF Extractor] Text extraction already completed for ${fileId}, skipping`);
      extractionStatusRef.current = 'completed';
      
      // Clean up from active extractions if needed
      if (activeExtractions.has(fileId)) {
        activeExtractions.delete(fileId);
      }
      
      onExtractionComplete(true);
      return;
    }
    
    setIsExtracting(true);
    console.log('[PDF Extractor] Starting text extraction for', fileId);
    
    try {
      // Wait for document to be fully ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const documentViewer = instance.Core.documentViewer;
      const totalPages = await documentViewer.getPageCount();
      
      if (totalPages === 0) {
        console.error('[PDF Extractor] No pages found in document');
        setIsExtracting(false);
        extractionStatusRef.current = 'failed';
        activeExtractions.delete(fileId);
        onExtractionComplete(false);
        return;
      }
      
      console.log(`[PDF Extractor] Beginning extraction of ${totalPages} pages`);
      
      const doc = await documentViewer.getDocument();
      const batchSize = 10;
      const batches = Math.ceil(totalPages / batchSize);
      let extractedText: string = '';
      
      for (let batch = 0; batch < batches; batch++) {
        const startPage = batch * batchSize + 1;
        const endPage = Math.min((batch + 1) * batchSize, totalPages);
        
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          try {
            const text = await doc.loadPageText(pageNum);
            extractedText += `[START_PAGE]${text}[END_PAGE]`;

            console.log(`[PDF Extractor] Extracted text from page ${pageNum}: ${text?.substring(0, 100)}...`);
            
            // Update progress
            const progress = Math.round((pageNum / totalPages) * 100);
            onExtractionProgress?.(progress);
          } catch (error) {
            console.error(`[PDF Extractor] Error extracting page ${pageNum}:`, error);
            extractedText += `[START_PAGE][EXTRACTION_FAILED][END_PAGE]`;
          }
        }
      }
      
      // Send extracted text to API
      try {
        console.log(`[PDF Extractor] Sending extracted text to API for file ${fileId}`);
        console.log(`[PDF Extractor] Extracted text length: ${extractedText.length} characters`);
        
        const apiUrl = `/api/files/${fileId}/save-text`;
        console.log(`[PDF Extractor] API endpoint: ${apiUrl}`);
        console.log(`[PDF Extractor] Payload text length:`, extractedText.length);
        
        const response = await api.post(
          apiUrl,
          { textByPages: extractedText },
          { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
          }
        );
        
        console.log('[PDF Extractor] Text saved successfully:', response.data);
        extractionStatusRef.current = 'completed';
        completedExtractions.add(fileId); // Mark as completed globally
        activeExtractions.delete(fileId);
        
        // Clear from active extraction
        PDFViewerManager.setActiveExtraction(null);
        
        // Add a slight delay to ensure backend processing completes
        setTimeout(() => {
          onExtractionComplete(true);
        }, 500);
      } catch (apiError: any) {
        console.error('[PDF Extractor] API error saving text:', apiError);
        if (apiError.response) {
          console.error('[PDF Extractor] API error response:', apiError.response.status, apiError.response.data);
        } else if (apiError.request) {
          console.error('[PDF Extractor] API error request:', apiError.request);
        } else {
          console.error('[PDF Extractor] API error message:', apiError.message);
        }
        extractionStatusRef.current = 'failed';
        activeExtractions.delete(fileId);
        // Clear from active extraction on error
        PDFViewerManager.setActiveExtraction(null);
        onExtractionComplete(false);
      }
    } catch (error) {
      console.error('[PDF Extractor] Error during extraction:', error);
      extractionStatusRef.current = 'failed';
      activeExtractions.delete(fileId);
      // Clear from active extraction on any error
      PDFViewerManager.setActiveExtraction(null);
      onExtractionComplete(false);
    } finally {
      setIsExtracting(false);
    }
  };
  
  return (
    <div className="pdf-extractor" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {error && (
        <div className="bg-red-100 text-red-700 p-2 mb-2 rounded text-xs">
          {error}
        </div>
      )}
      <div 
        ref={viewerRef} 
        className="webviewer" 
        style={{ 
          width: '100%', 
          height: '100%',
          flex: 1,
          minHeight: '400px',
        }}
      />
    </div>
  );
};
