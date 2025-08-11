'use client';

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { TextLayer, setLayerDimensions } from 'pdfjs-dist/build/pdf.mjs';
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
  shouldExtractText = false
}: PdfViewerClientProps) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Remove text extraction state since extraction is handled elsewhere
  // const [isExtracting, setIsExtracting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]); // eslint-disable-line @typescript-eslint/no-unused-vars
  // Manual search state
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState(-1);
  const [allMatches, setAllMatches] = useState<Array<{pageNum: number, text: string}>>([]);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, { cancel: () => void; promise: Promise<unknown> }>>(new Map());
  const textLayersRef = useRef<Map<number, { cancel?: () => void }>>(new Map());
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
        layer.cancel?.();
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

  // Removed local text extraction; handled by PdfExtractor

  // Render text layer using PDF.js TextLayer
  const renderTextLayer = useCallback(async (page: PDFPageProxy, viewport: unknown, container: HTMLElement, pageNum: number) => {
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
        } catch {
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
      pageContainer.style.setProperty('--user-unit', String((viewport as { rawDims?: { userUnit?: number } })?.rawDims?.userUnit ?? 1));
      pageContainer.style.setProperty('--scale-round-x', '1px');
      pageContainer.style.setProperty('--scale-round-y', '1px');
      
      // Additional variables for better PDF.js compatibility
      pageContainer.style.setProperty('--viewport-width', `${viewport.width}px`);
      pageContainer.style.setProperty('--viewport-height', `${viewport.height}px`);
      
      // Add font-related variables for consistent text rendering
      pageContainer.style.setProperty('--text-layer-opacity', '1');
      pageContainer.style.setProperty('--text-layer-overflow', 'clip');
      
      // Store any existing highlights before clearing canvas
      const existingHighlights: Array<{selector: string, styles: Record<string, string>}> = [];
      const textLayer = pageContainer.querySelector('.textLayer') as HTMLElement;
      if (textLayer) {
        const highlightedSpans = textLayer.querySelectorAll('span.highlight');
        highlightedSpans.forEach((span) => {
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
      if (typeof (context as CanvasRenderingContext2D & { setTransform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void }).setTransform === 'function') {
        (context as CanvasRenderingContext2D & { setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void }).setTransform(1, 0, 0, 1, 0, 0);
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
      
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, error);
      }
    }
  }, [scale, renderTextLayer]);

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

  // Enhanced text normalization with comprehensive mapping (commented out as not used)
  // const buildNormalizedWithMap = useCallback((s: string) => {
  //   let normalized = '';
  //   const map: number[] = [];
  //   let i = 0;
  //   let inWS = false;
  //   for (; i < s.length; i++) {
  //     const ch = s[i];
  //     if (/\s/.test(ch)) {
  //       if (!inWS) {
  //         if (normalized.length > 0) {
  //           normalized += ' ';
  //           map.push(i);
  //         }
  //         inWS = true;
  //       }
  //     } else {
  //       normalized += ch;
  //       map.push(i);
  //       inWS = false;
  //     }
  //   }
  //   // Trim any trailing space we might have added at the end
  //   if (normalized.endsWith(' ')) {
  //     normalized = normalized.slice(0, -1);
  //     map.pop();
  //   }
  //   return { normalized, map };
  // }, []);

  // Comprehensive text normalization for robust matching
  const normalizeTextRobust = useCallback((text: string) => {
    return text
      // Unicode normalization
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Handle non-breaking spaces and special whitespace
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      // Fix punctuation spacing
      .replace(/\s+([.,:;!?])/g, '$1')
      // Handle hyphenated words at line breaks
      .replace(/-\s+/g, '-')
      // Remove extra hyphens after numbers
      .replace(/(\d)-+/g, '$1')
      .trim();
  }, []);

  // Build comprehensive normalized text with mapping for precise highlighting
  const buildRobustNormalizedWithMap = useCallback((text: string) => {
    let normalized = '';
    const map: number[] = [];
    
    // First pass: Unicode normalization and special character handling
    const unicodeNormalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    let i = 0;
    let inWhitespace = false;
    
    for (i = 0; i < unicodeNormalized.length; i++) {
      const char = unicodeNormalized[i];
      
      // Handle various whitespace characters
      if (/[\s\u00A0\u2000-\u200B\u2028\u2029]/.test(char)) {
        if (!inWhitespace && normalized.length > 0) {
          // Look ahead to handle hyphenated words
          let j = i + 1;
          while (j < unicodeNormalized.length && /\s/.test(unicodeNormalized[j])) {
            j++;
          }
          
          // Check if previous character was a hyphen
          if (normalized.endsWith('-')) {
            // Don't add space after hyphen (line break hyphenation)
            inWhitespace = true;
            continue;
          }
          
          normalized += ' ';
          map.push(i);
          inWhitespace = true;
        }
      } 
      // Handle punctuation spacing
      else if (/[.,:;!?]/.test(char)) {
        // Remove space before punctuation if it exists
        if (normalized.endsWith(' ')) {
          normalized = normalized.slice(0, -1);
          map.pop();
        }
        normalized += char;
        map.push(i);
        inWhitespace = false;
      }
      // Handle hyphens after numbers
      else if (char === '-' && normalized.length > 0 && /\d/.test(normalized[normalized.length - 1])) {
        // Look ahead for multiple hyphens
        let j = i + 1;
        while (j < unicodeNormalized.length && unicodeNormalized[j] === '-') {
          j++;
        }
        // Only keep the number, skip all hyphens
        i = j - 1; // Will be incremented by loop
        inWhitespace = false;
      }
      // Regular characters
      else {
        normalized += char;
        map.push(i);
        inWhitespace = false;
      }
    }
    
    // Final cleanup
    normalized = normalized.trim();
    
    return { normalized, map };
  }, []);

  // Create tolerant search patterns for fallback matching
  const createTolerancePatterns = useCallback((query: string) => {
    const patterns = [];
    
    // Level 1: Strict normalized
    patterns.push({
      pattern: normalizeTextRobust(query).toLowerCase(),
      tolerance: 'strict'
    });
    
    // Level 2: Punctuation/whitespace tolerant
    const punctuationTolerant = normalizeTextRobust(query)
      .replace(/[.,:;!?]/g, '\\s*[.,:;!?]?\\s*')
      .replace(/\s+/g, '\\s+')
      .toLowerCase();
    patterns.push({
      pattern: punctuationTolerant,
      tolerance: 'punctuation',
      isRegex: true
    });
    
    // Level 3: Hyphen relaxed
    const hyphenRelaxed = normalizeTextRobust(query)
      .replace(/-/g, '-?\\s*')
      .replace(/\s+/g, '\\s+')
      .toLowerCase();
    patterns.push({
      pattern: hyphenRelaxed,
      tolerance: 'hyphen',
      isRegex: true
    });
    
    // Level 4: Letters and digits only (most permissive)
        const lettersDigitsOnly = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (lettersDigitsOnly.length > 3) { // Only for reasonable length queries
          patterns.push({
            pattern: lettersDigitsOnly,
            tolerance: 'letters_digits' as const
          });
        }
    
    return patterns;
  }, [normalizeTextRobust]);

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
    const patterns = createTolerancePatterns(searchQuery);
    
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
    const { normalized: combinedNormLower, map } = buildRobustNormalizedWithMap(combinedLower);
    
    let matchStartOriginal = -1;
    let matchEndOriginal = -1;

    // 1) Strict normalized search
    const strictPat = patterns.find(p => p.tolerance === 'strict');
    if (strictPat) {
      const normIdx = combinedNormLower.indexOf(strictPat.pattern as string);
      if (normIdx !== -1) {
        const normEndIdx = normIdx + (strictPat.pattern as string).length - 1;
        matchStartOriginal = map[normIdx] ?? -1;
        const endMapped = map[normEndIdx];
        matchEndOriginal = (endMapped !== undefined ? endMapped + 1 : -1);
      }
    }

    // 2) Direct search on combined lower if not found
    if (matchStartOriginal === -1) {
      const directIdx = combinedLower.indexOf(queryLowerRaw);
      if (directIdx !== -1) {
        matchStartOriginal = directIdx;
        matchEndOriginal = directIdx + queryLowerRaw.length;
      }
    }

    // 3) Tolerant regex on normalized combined if still not found
    if (matchStartOriginal === -1) {
      const tolerantPatterns = patterns.filter(p => (p as { isRegex?: boolean }).isRegex);
      for (const tolerantPat of tolerantPatterns) {
        try {
          const re = new RegExp(tolerantPat.pattern as string);
          const m = combinedNormLower.match(re);
          if (m && m.index !== undefined) {
            const normIdx = m.index;
            const normEndIdx = normIdx + m[0].length - 1;
            matchStartOriginal = map[normIdx] ?? -1;
            const endMapped = map[normEndIdx];
            matchEndOriginal = (endMapped !== undefined ? endMapped + 1 : -1);
            break;
          }
        } catch (e) {
          console.warn('[Highlight] Regex compilation failed for tolerant pattern', tolerantPat, e);
        }
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
      console.log(`[Highlight] No match found for "${queryLowerRaw}" after robust matching on page ${pageNum}`);
    }
  }, [buildRobustNormalizedWithMap, createTolerancePatterns]);

  // Search for text in all pages
  const searchText = useCallback(async (searchQuery: string) => {
    if (!pdfDocRef.current || !searchQuery.trim()) {
      setSearchResults([]);
      setAllMatches([]);
      setCurrentSearchResultIndex(-1);
      clearHighlights();
      return;
    }

    console.log('[Search] searchText called', {
      raw: searchQuery,
      length: searchQuery.length,
    });

    // Clear existing highlights
    clearHighlights();
    
    const results: SearchResult[] = [];
    const matches: Array<{pageNum: number, text: string}> = [];
    const patterns = createTolerancePatterns(searchQuery);

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
        textContent.items.forEach((item) => {
          if ('str' in item) {
            pageText += item.str;
            // Add space if this item doesn't end with whitespace and next item doesn't start with whitespace
            if (item.str && !item.str.match(/\s$/)) {
              pageText += ' ';
            }
          }
        });
        console.log(`[Search] Page ${pageNum}: built pageText length ${pageText.length}`);
        
        const pageTextLower = pageText.toLowerCase();
        const { normalized: pageTextRobustNormLower } = buildRobustNormalizedWithMap(pageTextLower);
        
        let pageHasMatch = false;
        
        // Try strict normalized first
        const strict = patterns.find(p => p.tolerance === 'strict');
        if (strict && pageTextRobustNormLower.indexOf(strict.pattern as string) !== -1) {
          console.log(`[Search] Page ${pageNum}: strict normalized match`);
          results.push({
            pageIndex: pageNum - 1,
            textIndex: pageTextRobustNormLower.indexOf(strict.pattern as string),
            rect: new DOMRect(),
            text: strict.pattern as string
          });
          matches.push({ pageNum, text: strict.pattern as string });
          pageHasMatch = true;
        }

        // Fallback: direct search on raw lowered text
        if (!pageHasMatch) {
          const directIdx = pageTextLower.indexOf(normalizeTextRobust(searchQuery).toLowerCase());
          if (directIdx !== -1) {
            console.log(`[Search] Page ${pageNum}: direct match on lowered text`);
            results.push({
              pageIndex: pageNum - 1,
              textIndex: directIdx,
              rect: new DOMRect(),
              text: searchQuery
            });
            matches.push({ pageNum, text: searchQuery });
            pageHasMatch = true;
          }
        }

        // Tolerant regex patterns against robust normalized text
        if (!pageHasMatch) {
          const tolerantPatterns = patterns.filter(p => (p as { isRegex?: boolean }).isRegex);
          for (const tolerant of tolerantPatterns) {
            try {
              const re = new RegExp(tolerant.pattern as string);
              const m = pageTextRobustNormLower.match(re);
              if (m && m.index !== undefined) {
                console.log(`[Search] Page ${pageNum}: tolerant regex (${tolerant.tolerance}) match`);
                results.push({
                  pageIndex: pageNum - 1,
                  textIndex: m.index,
                  rect: new DOMRect(),
                  text: m[0]
                });
                matches.push({ pageNum, text: m[0] });
                pageHasMatch = true;
                break;
              }
            } catch (e) {
              console.warn('[Search] Regex compilation failed for tolerant pattern', tolerant, e);
            }
          }
        }

        // Extreme fallback: letters/digits only
        if (!pageHasMatch) {
          const lettersDigits = patterns.find(p => p.tolerance === 'letters_digits');
          if (lettersDigits) {
            const pageLettersDigitsOnly = pageTextLower.replace(/[^a-z0-9]/g, '');
            if (pageLettersDigitsOnly.indexOf(lettersDigits.pattern as string) !== -1) {
              console.log(`[Search] Page ${pageNum}: letters/digits-only fallback match`);
              results.push({
                pageIndex: pageNum - 1,
                textIndex: 0,
                rect: new DOMRect(),
                text: lettersDigits.pattern as string
              });
              matches.push({ pageNum, text: lettersDigits.pattern as string });
              pageHasMatch = true;
            }
          }
        }
      }
      
      if (results.length === 0) {
        console.log('[Search] No matches found');
      } else {
        console.log(`[Search] Found ${matches.length} matches across ${results.length} pages`);
        // Render and highlight the first match
        if (matches.length > 0) {
          const firstMatch = matches[0];
          await renderPage(firstMatch.pageNum, scale);
          await highlightTextInPage(firstMatch.pageNum, searchQuery);
          setCurrentSearchResultIndex(0);
        }
      }
      
      setSearchResults(results);
      setAllMatches(matches);
      
    } catch (error) {
      console.error('Error searching text:', error);
    }
  }, [pdfDocRef, clearHighlights, renderPage, scale, createTolerancePatterns, buildRobustNormalizedWithMap, normalizeTextRobust, highlightTextInPage]);

  // Navigate to next search result
  const goToNextMatch = useCallback(async () => {
    if (allMatches.length === 0 || !manualSearchQuery.trim()) return;
    
    const nextIndex = (currentSearchResultIndex + 1) % allMatches.length;
    const nextMatch = allMatches[nextIndex];
    
    setCurrentSearchResultIndex(nextIndex);
    clearHighlights();
    await renderPage(nextMatch.pageNum, scale);
    await highlightTextInPage(nextMatch.pageNum, manualSearchQuery);
  }, [allMatches, currentSearchResultIndex, manualSearchQuery, clearHighlights, renderPage, scale, highlightTextInPage]);

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

  // Zoom controls (commented out as they're not used)
  // const zoomIn = useCallback(() => {
  //   setScale(prev => Math.min(3.0, prev + 0.25));
  // }, []);

  // const zoomOut = useCallback(() => {
  //   setScale(prev => Math.max(0.1, prev - 0.25));
  // }, []);

  // Navigation controls
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      scrollToPage(nextPage);
    }
  }, [currentPage, totalPages, scrollToPage]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      scrollToPage(prevPage);
    }
  }, [currentPage, scrollToPage]);

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
          console.log('Text extraction will be handled by PdfExtractor component');
        }
        
        PDFViewerManager.releaseInitializationLock();
        
      } catch (error: unknown) {
        console.error('Error loading PDF:', error);
        setError(`Error loading PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoading(false);
        PDFViewerManager.releaseInitializationLock();
      }
      
      initializingRef.current = false;
    };
    
    initializePdf();
  }, [pdfUrl, renderPage, isInitialized, paperId, shouldExtractText]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
            <button 
              onClick={goToPrevPage} 
              disabled={currentPage <= 1}
              className="py-1 rounded-md text-accent hover:text-accent-300  cursor-pointer transition-colors inline-flex items-center gap-1"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5m7 7l-7-7 7-7"/>
              </svg>
            </button>
            <span className="text-[var(--color-text-primary)] min-w-[60px] text-center">{currentPage} / {totalPages}</span>
            <button 
              onClick={goToNextPage} 
              disabled={currentPage >= totalPages}
              className="py-1 rounded-md text-accent hover:text-accent-300  cursor-pointer transition-colors inline-flex items-center gap-1"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14m-7-7l7 7-7 7"/>
              </svg>
            </button>
          </div>
          {/* Manual search input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '24px' }}>
            <input 
              type="text"
              value={manualSearchQuery}
              onChange={(e) => setManualSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const q = manualSearchQuery.trim();
                  if (q) {
                    searchText(q);
                  }
                }
              }}
              placeholder="Search in PDF..."
              className="px-2 py-1 rounded-md border border-accent bg-[var(--color-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] min-w-[220px]"
            />
            <button 
              onClick={() => {
                const q = manualSearchQuery.trim();
                if (q) {
                  searchText(q);
                }
              }}
              className="px-2 py-1 rounded-md bg-[var(--color-primary)]
              hover:bg- text-accent inline-flex items-center gap-1 cursor-pointer hover:text-accent-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              onClick={goToNextMatch}
              disabled={allMatches.length === 0}
              className="px-2 py-1 rounded-md bg-[var(--color-primary)]
              hover:bg- text-accent inline-flex items-center gap-1 cursor-pointer hover:text-accent-300"
              title="Next match"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14m-7-7l7 7-7 7"/>
              </svg>
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