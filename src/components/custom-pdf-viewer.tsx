'use client';

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
// @ts-ignore: No type declarations available for this module
import { TextLayer, setLayerDimensions } from 'pdfjs-dist/build/pdf.mjs';
import api from '@/lib/api';
import PDFViewerManager from '@/lib/pdf-viewer-manager';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { useChatStore } from '../store/chat';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PdfViewerClientProps {
  pdfUrl: string | null;
  textSnippet?: string;
  paperId?: string | null;
  shouldExtractText?: boolean;
  onTextExtractionComplete?: (success: boolean) => void;
  onTextExtractionProgress?: (progress: number) => void;
}

interface SearchResult {
  pageIndex: number;
  textIndex: number;
  rect: DOMRect;
  text: string;
}

export const CustomPdfViewer = ({ 
  pdfUrl, 
  textSnippet = '',
  paperId, 
  shouldExtractText = false,
  onTextExtractionComplete,
  onTextExtractionProgress,
}: PdfViewerClientProps) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const textLayersRef = useRef<Map<number, any>>(new Map());
  const mountedRef = useRef<boolean>(true);
  const uniqueId = useId();
  const elementId = useRef(`pdf-viewer-${paperId || 'doc'}-${uniqueId}-${Date.now()}`);
  const initializingRef = useRef<boolean>(false);
  const { handleHideFileDisplay } = usePDFViewer();

  // Clean up function
  const cleanUpViewer = useCallback(async () => {
    console.log(`Cleaning up PDF viewer instance: ${elementId.current}`);
    
    // Cancel all render tasks
    renderTasksRef.current.forEach((task, pageNum) => {
      try {
        task.cancel();
      } catch (err) {
        console.error(`Error canceling render task for page ${pageNum}:`, err);
      }
    });
    renderTasksRef.current.clear();
    
    // Cancel text layers
    textLayersRef.current.forEach((layer, pageNum) => {
      try {
        layer.cancel();
      } catch (err) {
        console.error(`Error canceling text layer for page ${pageNum}:`, err);
      }
    });
    textLayersRef.current.clear();
    
    // Clear PDF document
    if (pdfDocRef.current) {
      try {
        await pdfDocRef.current.destroy();
      } catch (err) {
        console.error('Error destroying PDF document:', err);
      }
      pdfDocRef.current = null;
    }
    
    // Clear DOM
    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = '';
    }
    
    setTotalPages(0);
    setCurrentPage(1);
    setSearchResults([]);
  }, []);

  // Extract text from PDF with batching
  const extractTextFromPdf = useCallback(async (pdfDoc: PDFDocumentProxy, paperIdToExtract: string) => {
    if (isExtracting) {
      console.log('Already extracting text, skipping duplicate call');
      return;
    }
    
    try {
      setIsExtracting(true);
      console.log('Starting text extraction for document');
      
      const totalPages = pdfDoc.numPages;
      console.log(`Found ${totalPages} pages for extraction`);
      
      if (totalPages === 0) {
        console.error('No pages found in document');
        setIsExtracting(false);
        onTextExtractionComplete?.(false);
        return;
      }
      
      const batchSize = 10;
      const batches = Math.ceil(totalPages / batchSize);
      let extractedText: string = '';
      
      for (let batch = 0; batch < batches; batch++) {
        const startPage = batch * batchSize + 1;
        const endPage = Math.min((batch + 1) * batchSize, totalPages);
        console.log(`Processing batch ${batch + 1}/${batches}: pages ${startPage}-${endPage}`);
        
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          try {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .filter((item): item is TextItem => 'str' in item)
              .map(item => item.str)
              .join(' ');
            
            extractedText += `[START_PAGE]${pageText}[END_PAGE]`;
          } catch (error) {
            console.error(`Error extracting text from page ${pageNum}, retrying...`, error);
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
              const page = await pdfDoc.getPage(pageNum);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .filter((item): item is TextItem => 'str' in item)
                .map(item => item.str)
                .join(' ');
              
              extractedText += `[START_PAGE]${pageText}[END_PAGE]`;
            } catch (retryError) {
              console.error(`Failed to extract text from page ${pageNum} after retry`, retryError);
              extractedText += `[START_PAGE][EXTRACTION_FAILED][END_PAGE]`;
            }
          }
          
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
            timeout: 30000
          }
        );
        
        console.log('Text extraction complete:', response);
        PDFViewerManager.setActiveExtraction(null);
        onTextExtractionComplete?.(true);
      } catch (apiError) {
        console.error('API error saving extracted text:', apiError);
        onTextExtractionComplete?.(false);
        PDFViewerManager.setActiveExtraction(null);
      }
    } catch (error) {
      console.error('Error in text extraction process:', error);
      setIsExtracting(false);
      onTextExtractionComplete?.(false);
      PDFViewerManager.setActiveExtraction(null);
    }
  }, [isExtracting, onTextExtractionComplete, onTextExtractionProgress]);

  // Render a specific page with text layer
  const renderPage = useCallback(async (pageNum: number, targetScale?: number) => {
    if (!pdfDocRef.current || !canvasContainerRef.current) return;
    
    const currentScale = targetScale || scale;
    const pageKey = `page-${pageNum}`;
    
    try {
      console.log(`[Render] Start renderPage for ${pageKey} at scale ${currentScale}`);
      // Cancel existing render task for this page
      const existingTask = renderTasksRef.current.get(pageNum);
      if (existingTask) {
        console.log(`[Render] Cancelling existing render task for page ${pageNum}`);
        try {
          existingTask.cancel();
        } catch (e) {
          console.warn(`[Render] Error cancelling task for page ${pageNum}:`, e);
        }
        // Wait for the previous task to finish cancelling to avoid canvas reuse
        try {
          await existingTask.promise;
        } catch (_) {
          // Expected rejection when cancelled; ignore
        }
        renderTasksRef.current.delete(pageNum);
      }
      
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentScale });
      console.log(`[Render] Got page ${pageNum}, viewport: ${viewport.width}x${viewport.height}`);
      
      // Calculate device pixel ratio for crisp rendering
      const devicePixelRatio = window.devicePixelRatio || 1;
      const scaledViewport = page.getViewport({ scale: currentScale * devicePixelRatio });
      
      // Find or create page container
      let pageContainer = canvasContainerRef.current.querySelector(`#container-${pageKey}`) as HTMLDivElement;
      if (!pageContainer) {
        console.log(`[Render] Creating page container for ${pageKey}`);
        pageContainer = document.createElement('div');
        pageContainer.id = `container-${pageKey}`;
        pageContainer.style.position = 'relative';
        pageContainer.style.display = 'block';
        pageContainer.style.margin = '0 auto 20px auto';
        pageContainer.style.border = '1px solid #ccc';
        
        canvasContainerRef.current.appendChild(pageContainer);
      }
      
      // Always update container dimensions to match viewport exactly
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;
      
      // Set CSS variables required by PDF.js setLayerDimensions function
      // Based on official PDF.js implementation found in pdf.mjs:setLayerDimensions
      pageContainer.style.setProperty('--total-scale-factor', currentScale.toString());
      pageContainer.style.setProperty('--scale-factor', currentScale.toString());
      pageContainer.style.setProperty('--user-unit', String((viewport as any)?.rawDims?.userUnit ?? 1));
      pageContainer.style.setProperty('--scale-round-x', '1px');
      pageContainer.style.setProperty('--scale-round-y', '1px');
      
      // Additional variables for better PDF.js compatibility
      pageContainer.style.setProperty('--viewport-width', `${viewport.width}px`);
      pageContainer.style.setProperty('--viewport-height', `${viewport.height}px`);
      
      // Add font-related variables for consistent text rendering
      pageContainer.style.setProperty('--text-layer-opacity', '1');
      pageContainer.style.setProperty('--text-layer-overflow', 'clip');
      
      // Store any existing highlights before clearing canvas
      let existingHighlights: Array<{selector: string, styles: Record<string, string>}> = [];
      const textLayer = pageContainer.querySelector('.textLayer') as HTMLElement;
      if (textLayer) {
        const highlightedSpans = textLayer.querySelectorAll('span.highlight');
        highlightedSpans.forEach((span, index) => {
          const htmlSpan = span as HTMLElement;
          existingHighlights.push({
            selector: `span:nth-child(${Array.from(textLayer.children).indexOf(span) + 1})`,
            styles: {
              backgroundColor: htmlSpan.style.backgroundColor,
              color: htmlSpan.style.color,
              margin: htmlSpan.style.margin,
              padding: htmlSpan.style.padding,
              borderRadius: htmlSpan.style.borderRadius
            }
          });
        });
      }
      
      // Find or create canvas (clear it first to prevent reuse errors)
      let canvas = pageContainer.querySelector(`#${pageKey}`) as HTMLCanvasElement;
      if (!canvas) {
        console.log(`[Render] Creating canvas for ${pageKey}`);
        canvas = document.createElement('canvas');
        canvas.id = pageKey;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        // Canvas should fill the container exactly
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        pageContainer.appendChild(canvas);
      } else {
        // Clear the canvas context to prevent reuse errors
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      const context = canvas.getContext('2d');
      if (!context) return;
      
      // Reset any existing transform before applying device pixel ratio scaling
      if (typeof (context as any).setTransform === 'function') {
        (context as any).setTransform(1, 0, 0, 1, 0, 0);
      }
      
      // Set canvas pixel dimensions to match scaled viewport for crisp rendering
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;
      
      // Scale the context to account for device pixel ratio
      context.scale(devicePixelRatio, devicePixelRatio);
      
      const renderContext = {
        canvasContext: context,
        canvas,
        viewport: viewport, // Keep viewport unscaled; context is already scaled by devicePixelRatio
      };
      
      const renderTask = page.render(renderContext);
      renderTasksRef.current.set(pageNum, renderTask);
      
      await renderTask.promise;
      renderTasksRef.current.delete(pageNum);
      console.log(`[Render] Completed render for ${pageKey}`);
      
      // Create text layer using official PDF.js TextLayer with exact viewport
      await renderTextLayer(page, viewport, pageContainer, pageNum);
      
      // Restore highlights after text layer is recreated
      if (existingHighlights.length > 0) {
        setTimeout(() => {
          const newTextLayer = pageContainer.querySelector('.textLayer') as HTMLElement;
          if (newTextLayer) {
            existingHighlights.forEach(highlight => {
              const span = newTextLayer.querySelector(highlight.selector) as HTMLElement;
              if (span) {
                span.classList.add('highlight');
                Object.assign(span.style, highlight.styles);
              }
            });
          }
        }, 50);
      }
      
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, error);
      }
    }
  }, [scale]);

  // Render text layer using PDF.js TextLayer
  const renderTextLayer = useCallback(async (page: PDFPageProxy, viewport: any, container: HTMLElement, pageNum: number) => {
    try {
      // Cancel existing text layer
      const existingLayer = textLayersRef.current.get(pageNum);
      if (existingLayer) {
        existingLayer.cancel?.();
        textLayersRef.current.delete(pageNum);
      }
      
      // Remove existing text layer div
      const existingTextLayerDiv = container.querySelector('.textLayer');
      if (existingTextLayerDiv) {
        existingTextLayerDiv.remove();
      }
      
      // Create text layer div with minimal inline styles - let CSS do the heavy lifting
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      // Only set essential positioning styles - let globals.css handle the rest
      textLayerDiv.style.position = 'absolute';
      textLayerDiv.style.inset = '0';
      textLayerDiv.setAttribute('data-page-num', pageNum.toString());
      
      container.appendChild(textLayerDiv);
      
      // Set layer dimensions using PDF.js utility after appending to DOM
      setLayerDimensions(textLayerDiv, viewport);
      
      // Get text content stream
      const textContentSource = await page.getTextContent();
      
      // Create PDF.js TextLayer
      const textLayer = new TextLayer({
        textContentSource,
        container: textLayerDiv,
        viewport
      });
      
      textLayersRef.current.set(pageNum, textLayer);
      
      // Render the text layer
      await textLayer.render();
      
      console.log(`[TextLayer] Page ${pageNum}: text layer ready with official PDF.js implementation`);
      
    } catch (error) {
      console.error(`Error rendering text layer for page ${pageNum}:`, error);
    }
  }, []);

  // Clear all highlights
  const clearHighlights = useCallback(() => {
    if (!canvasContainerRef.current) return;
    
    const highlightedElements = canvasContainerRef.current.querySelectorAll('.highlight');
    highlightedElements.forEach(el => {
      el.classList.remove('highlight');
      (el as HTMLElement).style.backgroundColor = '';
      (el as HTMLElement).style.color = '';
      (el as HTMLElement).style.opacity = '';
      (el as HTMLElement).style.borderRadius = '';
      (el as HTMLElement).style.boxDecorationBreak = '';
    });
  }, []);

  // Helper: collapse whitespace and build a mapping from normalized indices to original indices
  const normalizeSpaces = useCallback((s: string) => s.replace(/\s+/g, ' ').trim(), []);
  const buildNormalizedWithMap = useCallback((s: string) => {
    let normalized = '';
    const map: number[] = [];
    let i = 0;
    let inWS = false;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (/\s/.test(ch)) {
        if (!inWS) {
          if (normalized.length > 0) {
            normalized += ' ';
            map.push(i);
          }
          inWS = true;
        }
      } else {
        normalized += ch;
        map.push(i);
        inWS = false;
      }
    }
    // Trim any trailing space we might have added at the end
    if (normalized.endsWith(' ')) {
      normalized = normalized.slice(0, -1);
      map.pop();
    }
    return { normalized, map };
  }, []);

  // Search for text in the PDF
  const searchText = useCallback(async (searchQuery: string) => {
    if (!pdfDocRef.current || !searchQuery.trim()) {
      setSearchResults([]);
      clearHighlights();
      return;
    }

    console.log('[Search] searchText called', {
      raw: searchQuery,
      length: searchQuery.length,
    });

    const diagQueryA = searchQuery.replace(/(?<!-)[\r\n]+/g, ' ').replace(/-\s+/g, '-');
    const diagQueryB = diagQueryA.replace(/(\d)-+/g, '$1');
    const diagQueryC = diagQueryB.replace(/\s+/g, ' ').trim();
    console.log('[Search] normalized query candidates', {
      A_joinNewlines_keepHyphen: diagQueryA,
      B_removeExtraHyphensAfterDigits: diagQueryB,
      C_collapseWhitespace: diagQueryC,
      lower_trim: diagQueryC.toLowerCase(),
    });
    
    // Clear existing highlights
    clearHighlights();
    
    const results: SearchResult[] = [];
    const queryLower = searchQuery.toLowerCase().trim();
    const queryNormalizedLower = normalizeSpaces(searchQuery).toLowerCase();
    
    try {
      // Search through all pages
      const pagesToSearch = pdfDocRef.current.numPages;
      console.log(`[Search] Will search ${pagesToSearch} pages`);
      
      for (let pageNum = 1; pageNum <= pagesToSearch; pageNum++) {
        console.log(`[Search] Processing page ${pageNum}`);
        const page = await pdfDocRef.current.getPage(pageNum);
        const textContent = await page.getTextContent();
        console.log(`[Search] Page ${pageNum}: got ${textContent.items.length} items`);
        
        // Build the complete page text and track character positions
        let pageText = '';
        const textItems: Array<{ item: TextItem; startIndex: number; endIndex: number }> = [];
        
        textContent.items.forEach((item) => {
          if ('str' in item) {
            const startIndex = pageText.length;
            pageText += item.str;
            const endIndex = pageText.length;
            textItems.push({ item, startIndex, endIndex });
            
            // Add space if this item doesn't end with whitespace and next item doesn't start with whitespace
            if (item.str && !item.str.match(/\s$/)) {
              pageText += ' ';
            }
          }
        });
        console.log(`[Search] Page ${pageNum}: built pageText length ${pageText.length}`);
        
        const pageTextLower = pageText.toLowerCase();
        const { normalized: pageTextNormalized, map } = buildNormalizedWithMap(pageText);
        const pageTextNormalizedLower = pageTextNormalized.toLowerCase();
        
        console.log(`[Search] Page ${pageNum}: normalized pageText length ${pageTextNormalized.length}`);
        
        // Look for matches in normalized text first
        const normalizedMatch = pageTextNormalizedLower.indexOf(queryNormalizedLower);
        if (normalizedMatch !== -1) {
          console.log(`[Search] Page ${pageNum}: found normalized match at position ${normalizedMatch}`);
          results.push({
            pageIndex: pageNum - 1,
            textIndex: normalizedMatch,
            rect: new DOMRect(),
            text: queryNormalizedLower
          });
          
          // Render the page first
          await renderPage(pageNum, scale);
          
          // Then highlight the text
          await highlightTextInPage(pageNum, queryNormalizedLower);
          break; // Only highlight the first match for now
        }
        
        // Fallback to direct match
        const directMatch = pageTextLower.indexOf(queryLower);
        if (directMatch !== -1) {
          console.log(`[Search] Page ${pageNum}: found direct match at position ${directMatch}`);
          results.push({
            pageIndex: pageNum - 1,
            textIndex: directMatch,
            rect: new DOMRect(),
            text: queryLower
          });
          
          // Render the page first
          await renderPage(pageNum, scale);
          
          // Then highlight the text
          await highlightTextInPage(pageNum, queryLower);
          break; // Only highlight the first match for now
        }
      }
      
      if (results.length === 0) {
        console.log('[Search] No matches found');
      }
      
      setSearchResults(results);
      
    } catch (error) {
      console.error('Error searching text:', error);
    }
  }, [pdfDocRef, clearHighlights, renderPage, scale, normalizeSpaces, buildNormalizedWithMap]);

  // Highlight text in specific page
  const highlightTextInPage = useCallback(async (pageNum: number, searchQuery: string) => {
    if (!canvasContainerRef.current) return;
    
    const pageContainer = canvasContainerRef.current.querySelector(`#container-page-${pageNum}`) as HTMLElement;
    if (!pageContainer) {
      console.log(`[Highlight] Page container not found for page ${pageNum}`);
      return;
    }
    
    let textLayer = pageContainer.querySelector('.textLayer') as HTMLElement;
    if (!textLayer) {
      console.log(`[Highlight] Text layer not found for page ${pageNum}`);
      return;
    }
    
    // If text layer exists but not yet populated, retry once on next frame
    let spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
    if (spans.length === 0) {
      await new Promise(requestAnimationFrame);
      textLayer = pageContainer.querySelector('.textLayer') as HTMLElement;
      spans = Array.from(textLayer?.querySelectorAll('span') ?? []) as HTMLElement[];
    }
    
    console.log(`[Highlight] Processing page ${pageNum} text layer with ${spans.length} spans`);
    if (spans.length === 0) {
      console.log('[Highlight] No spans found to search/highlight');
      return;
    }
    
    const queryLowerRaw = searchQuery.toLowerCase().trim();
    const queryLowerNorm = normalizeSpaces(queryLowerRaw);
    
    // Build a combined text from spans with smart space insertion, and segment map
    let combined = '';
    const segments: Array<{ span: HTMLElement; start: number; end: number; text: string }> = [];
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      const t = (s.textContent || '');
      const start = combined.length;
      combined += t;
      const end = combined.length;
      segments.push({ span: s, start, end, text: t });
      if (i < spans.length - 1) {
        const nextT = (spans[i + 1].textContent || '');
        const needsSpace = !(t.match(/\s$/) || nextT.match(/^\s/));
        if (needsSpace) combined += ' ';
      }
    }
    
    const combinedLower = combined.toLowerCase();
    const { normalized: combinedNorm, map } = buildNormalizedWithMap(combinedLower);
    const combinedNormLower = combinedNorm; // already lowered
    
    let normIdx = combinedNormLower.indexOf(queryLowerNorm);
    let matchStartOriginal = -1;
    let matchEndOriginal = -1;
    
    if (normIdx !== -1) {
      // Map normalized index range back to original combined indices
      const normEndIdx = normIdx + queryLowerNorm.length - 1;
      matchStartOriginal = map[normIdx] ?? -1;
      const endMapped = map[normEndIdx];
      matchEndOriginal = (endMapped !== undefined ? endMapped + 1 : -1);
    } else {
      // Fallback: try direct search without normalization
      const directIdx = combinedLower.indexOf(queryLowerRaw);
      if (directIdx !== -1) {
        matchStartOriginal = directIdx;
        matchEndOriginal = directIdx + queryLowerRaw.length;
      }
    }
    
    if (matchStartOriginal !== -1 && matchEndOriginal !== -1) {
      console.log(`[Highlight] Match in combined text at [${matchStartOriginal}, ${matchEndOriginal})`);
      
      // Apply highlight to all spans whose segment overlaps the match range
      let firstHighlightedSpan: HTMLElement | null = null;
      for (const seg of segments) {
        if (seg.start < matchEndOriginal && seg.end > matchStartOriginal) {
          seg.span.classList.add('highlight');
          // Inline styles are fine but CSS already applies appearance via !important
          seg.span.style.backgroundColor = seg.span.style.backgroundColor || '#ffeb3b';
          if (!firstHighlightedSpan) firstHighlightedSpan = seg.span;
        }
      }
      
      // Ensure the page is in view first, then center the first highlighted span
      pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (firstHighlightedSpan) {
        setTimeout(() => {
          firstHighlightedSpan?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      }
    } else {
      console.log(`[Highlight] No match found for "${queryLowerRaw}" after normalization on page ${pageNum}`);
    }
  }, [normalizeSpaces, buildNormalizedWithMap]);

  // Scroll to a specific page
  const scrollToPage = useCallback((pageNum: number) => {
    if (!canvasContainerRef.current) return;
    
    const pageContainer = canvasContainerRef.current.querySelector(`#container-page-${pageNum}`) as HTMLElement;
    if (pageContainer) {
      pageContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Fit width functionality
  const fitToWidth = useCallback(async () => {
    if (!pdfDocRef.current || !canvasContainerRef.current) return;
    
    try {
      const containerWidth = canvasContainerRef.current.clientWidth - 40; // Account for padding
      
      // Find the widest page among the first 10 pages (or all pages if less than 10)
      const pagesToCheck = Math.min(10, pdfDocRef.current.numPages);
      let maxPageWidth = 0;
      
      for (let i = 1; i <= pagesToCheck; i++) {
        try {
          const page = await pdfDocRef.current.getPage(i);
          const vp = page.getViewport({ scale: 1.0 });
          maxPageWidth = Math.max(maxPageWidth, vp.width);
        } catch (e) {
          console.error(`Error getting viewport for page ${i}:`, e);
        }
      }
      
      if (maxPageWidth > 0) {
        const newScale = containerWidth / maxPageWidth;
        setScale(Math.max(0.1, Math.min(3.0, newScale)));
      } else {
        // Fallback if no pages found
        const fallbackScale = containerWidth / 595; // Approximate PDF page width in CSS pixels for A4
        setScale(Math.max(0.1, Math.min(3.0, fallbackScale)));
      }
    } catch (e) {
      console.error('Error in fitToWidth:', e);
      // Fallback to previous heuristic if something goes wrong
      const fallbackScale = canvasContainerRef.current.clientWidth / 595; // Approximate PDF page width in CSS pixels for A4
      setScale(Math.max(0.1, Math.min(3.0, fallbackScale)));
    }
  }, []);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(3.0, prev + 0.25));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(0.1, prev - 0.25));
  }, []);

  // Navigation controls
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      scrollToPage(nextPage);
    }
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      scrollToPage(prevPage);
    }
  }, [currentPage]);

  // Re-render all pages when scale changes
  useEffect(() => {
    if (!pdfDocRef.current) return;
    
    const renderAllPages = async () => {
      for (let i = 1; i <= totalPages; i++) {
        await renderPage(i, scale);
      }
    };
    
    renderAllPages();
  }, [scale, renderPage, totalPages]);

  // Auto fit to width on initialization and when container resizes
  useEffect(() => {
    if (!isInitialized || !canvasContainerRef.current) return;

    const ro = new ResizeObserver(() => {
      fitToWidth();
    });
    ro.observe(canvasContainerRef.current);

    // Initial fit
    fitToWidth();

    return () => {
      ro.disconnect();
    };
  }, [isInitialized, fitToWidth]);

  // Search when textSnippet changes
  useEffect(() => {
    if (textSnippet && isInitialized) {
      console.log('[Effect] textSnippet changed, triggering search', {
        textSnippet,
        length: textSnippet.length,
        isInitialized
      });
      searchText(textSnippet);
    }
  }, [textSnippet, isInitialized, searchText]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      cleanUpViewer();
    };
  }, [cleanUpViewer]);

  // Main initialization effect
  useEffect(() => {
    if (!mountedRef.current || initializingRef.current || !pdfUrl) {
      return;
    }
    
    initializingRef.current = true;
    
    const initializePdf = async () => {
      if (isInitialized || pdfDocRef.current) {
        console.log('PDF already initialized, skipping');
        initializingRef.current = false;
        return;
      }
      
      const canInitialize = await PDFViewerManager.requestInitialization(elementId.current);
      
      if (!canInitialize || !mountedRef.current) {
        console.log('Cannot initialize PDF viewer');
        PDFViewerManager.releaseInitializationLock();
        initializingRef.current = false;
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('Loading PDF document');
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/',
        });
        
        const pdf = await loadingTask.promise;
        
        if (!mountedRef.current) {
          console.log('Component unmounted during PDF loading');
          PDFViewerManager.releaseInitializationLock();
          initializingRef.current = false;
          return;
        }
        
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        console.log('PDF loaded successfully, total pages:', pdf.numPages);
        
        // Render first page by default
        await renderPage(1);
        
        setIsInitialized(true);
        setIsLoading(false);
        
        // Start text extraction if needed
        if (shouldExtractText && paperId) {
          const activeExtraction = PDFViewerManager.getActiveExtraction();
          if (!activeExtraction || activeExtraction !== paperId) {
            PDFViewerManager.setActiveExtraction(paperId);
            extractTextFromPdf(pdf, paperId);
          }
        }
        
        PDFViewerManager.releaseInitializationLock();
        
      } catch (error: any) {
        console.error('Error loading PDF:', error);
        setError(`Error loading PDF: ${error.message}`);
        setIsLoading(false);
        PDFViewerManager.releaseInitializationLock();
      }
      
      initializingRef.current = false;
    };
    
    initializePdf();
  }, [pdfUrl, renderPage, shouldExtractText, paperId, extractTextFromPdf, isInitialized]);

  return (
      <div className="custom-pdf-viewer" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}>
      {/* Controls */}
      <div 
        className="pdf-toolbar"
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '8px 12px', 
          borderBottom: '1px solid var(--color-secondary)',
          backgroundColor: 'var(--color-background-header)',
          gap: '10px',
          color: 'var(--color-text-primary)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button 
              onClick={goToPrevPage} 
              disabled={currentPage <= 1}
              className="px-2 py-1 rounded-md bg-[var(--color-secondary-50)] text-[var(--color-primary)] hover:bg-[var(--color-secondary-200)] disabled:opacity-50 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-[var(--color-text-primary)] min-w-[60px] text-center">{currentPage} / {totalPages}</span>
            <button 
              onClick={goToNextPage} 
              disabled={currentPage >= totalPages}
              className="px-2 py-1 rounded-md bg-[var(--color-secondary-50)] text-[var(--color-primary)] hover:bg-[var(--color-secondary-200)] disabled:opacity-50 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          <button 
            aria-label="Close"
            onClick={() => {
              useChatStore.getState().setCurrentReference(null);
              handleHideFileDisplay();
            }}
            className="text-[var(--color-text-primary)] hover:text-[var(--color-accent)] p-1 rounded-full"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error ? (
        <div className="flex items-center justify-center h-full w-full bg-gray-100 text-red-500 p-4">
          <p>{error}</p>
          <button 
            className="ml-3 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={async () => {
              setError(null);
              await cleanUpViewer();
              initializingRef.current = false;
              setIsInitialized(false);
            }}
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-full w-full bg-gray-100">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        /* PDF Canvas Container */
        <div 
          ref={canvasContainerRef}
          style={{ 
            height: '100%',  // Changed from flex: 1 to height: 100%
            flex: 1, // Take remaining space below toolbar
            minHeight: 0, // Allow internal scrolling instead of growing the parent
             overflow: 'auto', 
             padding: '20px',
             backgroundColor: '#f9f9f9'
          }}
        />
      )}
    </div>
  );
};