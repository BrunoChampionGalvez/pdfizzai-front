// 'use client';

// import { useEffect, useRef, useState, useCallback } from 'react';
// import * as pdfjsLib from 'pdfjs-dist';
// import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
// import PDFViewerManager from '@/lib/pdf-viewer-manager';

// // Configure PDF.js worker
// pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

// // Normalize whitespace: replace non-breaking spaces, strip zero-width chars, collapse whitespace to single spaces, and trim
// const normalizeSpaces = (s: string): string =>
//   s
//     .replace(/\u00A0/g, ' ')
//     .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
//     .replace(/\s+/g, ' ')
//     .trim();

// interface PdfExtractorProps {
//   fileId: string;
//   fileUrl: string;
//   onExtractionComplete: (success: boolean) => void;
//   onExtractionProgress?: (progress: number) => void;
// }

// // Global state for extraction management
// const globalExtractionState = {
//   activeExtractions: new Map<string, {
//     instanceId: string;
//     promise: Promise<boolean>;
//     abortController: AbortController;
//     startTime: number;
//   }>(),
//   completedExtractions: new Set<string>(),
//   isAnyExtractionActive: false,
//   globalLock: false
// };

// export const PdfExtractor = ({
//   fileId,
//   fileUrl,
//   onExtractionComplete,
//   onExtractionProgress
// }: PdfExtractorProps) => {
//   const [error, setError] = useState<string | null>(null);
//   const [extractionProgress, setExtractionProgress] = useState(0);
  
//   const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
//   const mountedRef = useRef<boolean>(true);
//   const extractionStatusRef = useRef<'idle' | 'loading' | 'extracting' | 'completed' | 'failed'>('idle');
//   const initializingRef = useRef<boolean>(false);
//   const abortControllerRef = useRef<AbortController | null>(null);

//   const instanceId = `pdf-extractor-${fileId}-${Date.now()}`;

//   // Clean up function
//   const cleanUpExtractor = useCallback(async () => {
//     console.log('[PDF Extractor] Cleaning up extractor instance:', instanceId);
    
//     // Abort any ongoing operations
//     if (abortControllerRef.current) {
//       abortControllerRef.current.abort();
//       abortControllerRef.current = null;
//     }
    
//     if (pdfDocRef.current) {
//       try {
//         await pdfDocRef.current.destroy();
//         pdfDocRef.current = null;
//       } catch (err) {
//         console.error('[PDF Extractor] Error destroying PDF document:', err);
//       }
//     }
    
//     PDFViewerManager.unregisterViewer(instanceId);
    
//     // Only remove from active extractions if this is the current instance
//     const activeExtraction = globalExtractionState.activeExtractions.get(fileId);
//     if (activeExtraction && activeExtraction.instanceId === instanceId) {
//       globalExtractionState.activeExtractions.delete(fileId);
//       console.log('[PDF Extractor] Removed active extraction for fileId:', fileId);
//     }
    
//     // Update global state
//     globalExtractionState.isAnyExtractionActive = globalExtractionState.activeExtractions.size > 0;
//   }, [fileId, instanceId]);

//   // Extract text from PDF with improved error handling
//   const extractTextFromPdf = useCallback(async (pdfDoc: PDFDocumentProxy, abortSignal: AbortSignal) => {
//     console.log('[PDF Extractor] Starting text extraction process');
    
//     try {
//       const totalPages = pdfDoc.numPages;
//       console.log(`[PDF Extractor] Found ${totalPages} pages to extract`);
      
//       if (totalPages === 0) {
//         console.error('[PDF Extractor] No pages found in document');
//         return false;
//       }
      
//       const batchSize = 3; // Further reduced to prevent worker overload
//       const batches = Math.ceil(totalPages / batchSize);
//       // let extractedText: string = '';
      
//       for (let batch = 0; batch < batches; batch++) {
//         if (abortSignal.aborted) {
//           console.log('[PDF Extractor] Extraction aborted');
//           return false;
//         }
        
//         const startPage = batch * batchSize + 1;
//         const endPage = Math.min((batch + 1) * batchSize, totalPages);
//         console.log(`[PDF Extractor] Processing batch ${batch + 1}/${batches}: pages ${startPage}-${endPage}`);
        
//         for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
//           if (!mountedRef.current || abortSignal.aborted) {
//             console.log('[PDF Extractor] Component unmounted or aborted, stopping extraction');
//             return false;
//           }
          
//           // let pageText = '';
//           let attempts = 0;
//           const maxAttempts = 2;
          
//           while (attempts < maxAttempts && !abortSignal.aborted) {
//             try {
//               const page = await pdfDoc.getPage(pageNum);
//               const textContent = await page.getTextContent();
//               const rawText = textContent.items
//                 .filter((item): item is TextItem => 'str' in item)
//                 .map(item => item.str)
//                 .join(' ');
//               // pageText = normalizeSpaces(rawText);
//               break; // Success, exit retry loop
//             } catch (error) {
//               attempts++;
//               console.error(`[PDF Extractor] Error extracting text from page ${pageNum} (attempt ${attempts}/${maxAttempts}):`, error);
              
//               if (attempts < maxAttempts) {
//                 // Wait longer between retries
//                 await new Promise(resolve => setTimeout(resolve, 200 * attempts));
//               } else {
//                 //pageText = '[EXTRACTION_FAILED]';
//                 console.error(`[PDF Extractor] Failed to extract text from page ${pageNum} after ${maxAttempts} attempts`);
//               }
//             }
//           }
          
//           // extractedText += `[START_PAGE]${pageText}[END_PAGE]`;
          
//           // Update progress
//           const progress = Math.round(((batch * batchSize) + (pageNum - startPage + 1)) / totalPages * 100);
//           setExtractionProgress(progress);
//           onExtractionProgress?.(progress);
          
//           // Longer delay between pages to prevent worker conflicts
//           await new Promise(resolve => setTimeout(resolve, 50));
//         }
        
//         // Delay between batches
//         if (batch < batches - 1) {
//           await new Promise(resolve => setTimeout(resolve, 100));
//         }
//       }
      
//       if (abortSignal.aborted) {
//         console.log('[PDF Extractor] Extraction aborted before API call');
//         return false;
//       }
      
//       // Note: Text extraction is now handled automatically in the backend during file upload
//       // This frontend extraction component is no longer needed
//       console.log('[PDF Extractor] Text extraction is now handled in backend during upload');
      
//       // Return true immediately since extraction is handled in backend
//       return true;
//     } catch (error) {
//       if (abortSignal.aborted) {
//         console.log('[PDF Extractor] Extraction process aborted');
//         return false;
//       }
//       console.error('[PDF Extractor] Error in text extraction process:', error);
//       return false;
//     }
//   }, [fileId, onExtractionProgress]);

//   // Main initialization effect
//   useEffect(() => {
//     mountedRef.current = true;
    
//     return () => {
//       mountedRef.current = false;
//       cleanUpExtractor();
//     };
//   }, [cleanUpExtractor]);

//   useEffect(() => {
//     if (!mountedRef.current || initializingRef.current || !fileUrl || !fileId) {
//       return;
//     }
    
//     // Check if this extraction is already completed
//     if (globalExtractionState.completedExtractions.has(fileId)) {
//       console.log(`[PDF Extractor] Extraction already completed for ${fileId}`);
//       extractionStatusRef.current = 'completed';
//       onExtractionComplete(true);
//       return;
//     }
    
//     // Check if there's already an active extraction for this file
//     const existing = globalExtractionState.activeExtractions.get(fileId);
//     if (existing) {
//       // Check if the existing extraction is stale (older than 2 minutes)
//       const isStale = Date.now() - existing.startTime > 120000;
      
//       if (isStale) {
//         console.log(`[PDF Extractor] Found stale extraction for ${fileId}, aborting it`);
//         existing.abortController.abort();
//         globalExtractionState.activeExtractions.delete(fileId);
//       } else {
//         console.log(`[PDF Extractor] Extraction already in progress for ${fileId}, waiting for completion`);
//         existing.promise.then((success) => {
//           if (mountedRef.current) onExtractionComplete(success);
//         }).catch((error) => {
//           console.error('[PDF Extractor] Error waiting for active extraction:', error);
//           if (mountedRef.current) onExtractionComplete(false);
//         });
//         return;
//       }
//     }
    
//     const initializeExtraction = () => {
//       initializingRef.current = true;
//       globalExtractionState.globalLock = true;
      
//       // Create a single abort controller to share across the whole extraction
//       const sharedAbortController = new AbortController();
//       abortControllerRef.current = sharedAbortController;

//       const performExtraction = async (abortController: AbortController): Promise<boolean> => {
//         const canInitialize = await PDFViewerManager.requestInitialization(instanceId);
        
//         if (!canInitialize || !mountedRef.current || abortController.signal.aborted) {
//           console.log(`[PDF Extractor] Cannot initialize: permission denied, unmounted, or aborted`);
//           PDFViewerManager.releaseInitializationLock();
//           globalExtractionState.globalLock = false;
//           initializingRef.current = false;
//           return false;
//         }
        
//         try {
//           extractionStatusRef.current = 'loading';
          
//           console.log(`[PDF Extractor] Loading PDF for extraction: \`${fileUrl}\``);
          
//           // Register with manager
//           PDFViewerManager.registerViewer(instanceId);
//           PDFViewerManager.setActiveExtraction(fileId);
          
//           // Load PDF document
//           const loadingTask = pdfjsLib.getDocument(fileUrl);
//           const pdfDoc = await loadingTask.promise;
          
//           if (!mountedRef.current || abortController.signal.aborted) {
//             console.log('[PDF Extractor] Component unmounted or aborted during PDF loading, cleaning up');
//             await pdfDoc.destroy();
//             PDFViewerManager.unregisterViewer(instanceId);
//             PDFViewerManager.setActiveExtraction(null);
//             PDFViewerManager.releaseInitializationLock();
//             globalExtractionState.globalLock = false;
//             return false;
//           }
          
//           pdfDocRef.current = pdfDoc;
//           extractionStatusRef.current = 'extracting';
          
//           console.log(`[PDF Extractor] PDF loaded successfully: ${pdfDoc.numPages} pages`);
          
//           // Extract text
//           const success = await extractTextFromPdf(pdfDoc, abortController.signal);
          
//           if (mountedRef.current && !abortController.signal.aborted) {
//             if (success) {
//               extractionStatusRef.current = 'completed';
//               globalExtractionState.completedExtractions.add(fileId);
//               console.log(`[PDF Extractor] Text extraction completed successfully for ${fileId}`);
//             } else {
//               extractionStatusRef.current = 'failed';
//               console.log(`[PDF Extractor] Text extraction failed for ${fileId}`);
//             }
            
//             onExtractionComplete(success);
//           }
          
//           // Clean up
//           PDFViewerManager.setActiveExtraction(null);
//           PDFViewerManager.unregisterViewer(instanceId);
//           PDFViewerManager.releaseInitializationLock();
//           globalExtractionState.globalLock = false;
//           initializingRef.current = false;
          
//           return success;
          
//         } catch (err: unknown) {
//           if (abortController.signal.aborted) {
//             console.log('[PDF Extractor] Extraction aborted during process');
//             globalExtractionState.globalLock = false;
//             return false;
//           }
          
//           console.error('[PDF Extractor] Error during PDF extraction:', err);
          
//           if (mountedRef.current) {
//             setError(`Failed to extract text: ${err instanceof Error ? err.message : 'Unknown error'}`);
//             extractionStatusRef.current = 'failed';
//             onExtractionComplete(false);
//           }
          
//           // Clean up on error
//           PDFViewerManager.unregisterViewer(instanceId);
//           PDFViewerManager.setActiveExtraction(null);
//           PDFViewerManager.releaseInitializationLock();
//           globalExtractionState.globalLock = false;
//           initializingRef.current = false;
          
//           return false;
//         }
//       };
      
//       // Register this extraction as active before starting
//       const extractionPromise = performExtraction(sharedAbortController);
//       globalExtractionState.activeExtractions.set(fileId, {
//         instanceId,
//         promise: extractionPromise,
//         abortController: sharedAbortController,
//         startTime: Date.now()
//       });
      
//       globalExtractionState.isAnyExtractionActive = true;
      
//       console.log(`[PDF Extractor] Registered new extraction for fileId: ${fileId}, instanceId: ${instanceId}`);
      
//       // Handle completion/cleanup
//       extractionPromise.finally(() => {
//         const currentActive = globalExtractionState.activeExtractions.get(fileId);
//         if (currentActive && currentActive.instanceId === instanceId) {
//           globalExtractionState.activeExtractions.delete(fileId);
//           console.log(`[PDF Extractor] Completed and removed extraction for fileId: ${fileId}`);
//         }
//         globalExtractionState.isAnyExtractionActive = globalExtractionState.activeExtractions.size > 0;
//         globalExtractionState.globalLock = false;
//       });
//     };

//     const scheduleAfterUnlock = () => {
//       if (!mountedRef.current) return;
//       if (!globalExtractionState.globalLock) {
//         initializeExtraction();
//       } else {
//         console.log(`[PDF Extractor] Waiting for global extraction lock to be released`);
//         setTimeout(scheduleAfterUnlock, 250);
//       }
//     };

//     // Wait for global lock to be available, otherwise start immediately
//     if (globalExtractionState.globalLock) {
//       scheduleAfterUnlock();
//       return;
//     }

//     initializeExtraction();

//     return () => {
//       if (initializingRef.current) {
//         PDFViewerManager.releaseInitializationLock();
//         globalExtractionState.globalLock = false;
//         initializingRef.current = false;
//       }
      
//       // Abort the extraction if it's still running
//       if (abortControllerRef.current) {
//         abortControllerRef.current.abort();
//       }
//     };
//   }, [fileUrl, fileId, onExtractionComplete, extractTextFromPdf, cleanUpExtractor, instanceId]);

//   // UI for the hidden extractor
//   return (
//     <div style={{ display: 'none' }}>
//       {/* Hidden PDF extractor - this component works in the background */}
//       {error && (
//         <div className="text-red-500 text-sm p-2">
//           Extraction Error: {error}
//         </div>
//       )}
//       {extractionProgress > 0 && extractionProgress < 100 && (
//         <div className="text-blue-500 text-sm p-2">
//           Extracting text: {extractionProgress}%
//         </div>
//       )}
//     </div>
//   );
// };
