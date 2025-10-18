'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import PDFViewerManager from '@/lib/pdf-viewer-manager';
import api from '../lib/api';
import dynamic from 'next/dynamic';

// Dynamically import the PDF extractor to avoid SSR issues
const PdfExtractor = dynamic(
  () => import('../components/pdf-express-extractor').then(mod => ({ default: mod.PdfExtractor })),
  { ssr: false }
);

export interface AppFile {
  id: string;
  name: string;
  type: 'pdf';
  storage_path: string;
  google_storage_url?: string;
  expires?: number;
  size: number;
  content?: string;
  processed: boolean;
  textExtracted: boolean;
  createdAt: string;
  updatedAt: string;
  folderId?: string | null;
  parentId?: string | null;
}

interface PDFViewerState {
  isLoadingFile: boolean;
  currentFilePath: string | null;
  currentFile: Partial<AppFile> | null;
  textSnippet: string;
  showFileDisplay: boolean;
  currentFileId: string | null;
  error: string | null;
  // Extraction state
  extractionState: {
    fileId: string | null;
    fileUrl: string | null;
    isExtracting: boolean;
    completed: boolean;
    error: string | null;
  };
}

interface PDFViewerContextType extends PDFViewerState {
  handleShowFile: (fileId: string, textSnippet: string) => Promise<void>;
  handleHideFileDisplay: () => void;
  fetchPapers: () => Promise<void>;
  handleTextExtractionComplete: (success: boolean) => void;
  clearError: () => void;
  triggerExtraction: (fileId: string, fileUrl: string) => void;
  onFileListRefresh?: () => void;
  setFileListRefreshHandler: (handler: () => void) => void;
}

const PDFViewerContext = createContext<PDFViewerContextType | undefined>(undefined);

export const usePDFViewer = () => {
  const context = useContext(PDFViewerContext);
  if (context === undefined) {
    throw new Error('usePDFViewer must be used within a PDFViewerProvider');
  }
  return context;
};

interface PDFViewerProviderProps {
  children: React.ReactNode;
}

export const PDFViewerProvider: React.FC<PDFViewerProviderProps> = ({ children }) => {
  const [state, setState] = useState<PDFViewerState>({
    isLoadingFile: false,
    currentFilePath: null,
    currentFile: null,
    textSnippet: '',
    showFileDisplay: false,
    currentFileId: null,
    error: null,
    extractionState: {
      fileId: null,
      fileUrl: null,
      isExtracting: false,
      completed: false,
      error: null
    }
  });

  // Store reference to file list refresh handler
  const fileListRefreshHandler = React.useRef<(() => void) | null>(null);

  const apiBaseUrl = useMemo(() => api.defaults.baseURL ?? '', []);

  const resolveFileUrl = useCallback(
    (file: (Partial<AppFile> & { google_storage_url?: string }) | null | undefined) => {
      if (!file) {
        return null;
      }

      if (file.google_storage_url) {
        if (apiBaseUrl) {
          const normalizedBase = apiBaseUrl.endsWith('/')
            ? apiBaseUrl.slice(0, -1)
            : apiBaseUrl;
          return `${normalizedBase}/api/files/pdf-proxy?url=${encodeURIComponent(file.google_storage_url)}`;
        }
        return file.google_storage_url;
      }

      if (file.storage_path) {
        return `https://storage.googleapis.com/refdoc-ai-bucket/${file.storage_path}`;
      }

      return null;
    },
    [apiBaseUrl],
  );

  const handleShowFile = useCallback(async (fileId: string, textSnippet: string) => {
    if (!fileId) {
      console.error('Invalid file ID provided to handleShowFile');
      return;
    }

    console.log('textSnippet test 2:', textSnippet);

    // If the requested file is already loaded, avoid reloading/remounting the viewer.
    // Simply update the snippet and ensure the display is shown so the viewer stays mounted.
    if (state.currentFileId === fileId && state.currentFilePath) {
      setState(prev => ({
        ...prev,
        textSnippet: textSnippet || '',
        showFileDisplay: true,
        error: null,
        // Do NOT set isLoadingFile here to avoid temporarily unmounting the viewer
      }));
      return;
    }
    
    // First clean up any existing viewers to prevent conflicts when switching to a different file
    await PDFViewerManager.clearAllViewers();
    
    // Set loading state and show display
    setState(prevState => ({
      ...prevState,
      currentFileId: fileId,
      textSnippet: textSnippet || '',
      isLoadingFile: true,
      showFileDisplay: true,
      error: null,
    }));
    
    try {
      // Always fetch the file for now - we can optimize later
      const { data }: {data: AppFile | null} = await api.get(`/api/files/${fileId}`);
      
      // Ensure we have a valid path before setting it
      const filePath = resolveFileUrl(data as Partial<AppFile> & { google_storage_url?: string });
      if (data && filePath) {
        console.log('File path from API:', filePath);
        console.log('Setting current file path:', filePath);
        
        setState(prevState => ({
          ...prevState,
          currentFilePath: filePath,
          currentFile: data as unknown as Partial<AppFile>,
          isLoadingFile: false,
        }));
      } else {
        console.error('File response missing path:', data);
        setState(prevState => ({
          ...prevState,
          currentFilePath: null,
          isLoadingFile: false,
          error: 'File response missing path',
        }));
      }
    } catch (error) {
      console.error('Error fetching file content:', error);
      setState(prevState => ({
        ...prevState,
        currentFilePath: null,
        isLoadingFile: false,
        error: error instanceof Error ? error.message : 'Failed to fetch file',
      }));
    }
  }, [resolveFileUrl, state.currentFileId, state.currentFilePath]);

  const handleHideFileDisplay = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      showFileDisplay: false,
    }));
    
    // When hiding, clear all viewers to prevent issues next time
    PDFViewerManager.clearAllViewers();
    
    // Don't clear these values immediately for a smoother transition
    setTimeout(() => {
      setState(prevState => ({
        ...prevState,
        currentFileId: null,
        currentFilePath: null,
        currentFile: null,
        textSnippet: '',
        error: null,
      }));
    }, 300); // Match the transition duration
  }, []);

  const fetchPapers = useCallback(async () => {
    setState(prevState => {
      if (!prevState.currentFileId) return prevState;
      
      // Fetch in the background, don't wait for this
      (async () => {
        try {
          // Use the same endpoint as handleShowFile to get the specific file
          const response = await api.get(`/api/files/${prevState.currentFileId}`);
          
          console.log('fetchPapers response:', response);
          console.log('fetchPapers response.data:', response.data);
          console.log('fetchPapers storage_path:', response.data?.storage_path);
          
          // If we have a selected paper, update it with the fresh data
          if (response.data) {
            const resolvedUrl = resolveFileUrl(response.data);
            setState(currentState => ({
              ...currentState,
              currentFileId: response.data.id,
              currentFilePath: resolvedUrl,
              currentFile: response.data,
            }));
          }
        } catch (error) {
          console.error('Error fetching papers:', error);
          setState(currentState => ({
            ...currentState,
            error: error instanceof Error ? error.message : 'Failed to fetch papers',
          }));
        }
      })();
      
      return prevState;
    });
  }, [resolveFileUrl]);

  const handleTextExtractionComplete = useCallback((success: boolean) => {
    console.log('PDFViewerContext: Text extraction completed with success:', success);
    
    if (success) {
      // Update extraction state
      setState(prevState => ({
        ...prevState,
        extractionState: {
          ...prevState.extractionState,
          isExtracting: false,
          completed: true,
          error: null,
        }
      }));
      
      console.log('PDFViewerContext: Refreshing file data after extraction...');
      // Refresh the paper list to get the updated textExtracted status
      fetchPapers();
      
      // Call the file list refresh handler if available
      if (fileListRefreshHandler.current) {
        console.log('PDFViewerContext: Calling file list refresh handler...');
        fileListRefreshHandler.current();
      }
    } else {
      console.log('PDFViewerContext: Text extraction failed');
      setState(prevState => ({
        ...prevState,
        // Do not set the global viewer error so the PDF remains visible
        extractionState: {
          ...prevState.extractionState,
          isExtracting: false,
          completed: false,
          error: 'Text extraction failed',
        }
      }));
    }
  }, [fetchPapers]);

  const triggerExtraction = useCallback((fileId: string, fileUrl: string) => {
    console.log('PDFViewerContext: Triggering extraction for file:', fileId);
    console.log('PDFViewerContext: FileUrl received:', fileUrl);
    console.log('PDFViewerContext: FileUrl type:', typeof fileUrl);
    console.log('PDFViewerContext: FileUrl length:', fileUrl?.length);
    
    setState(prevState => ({
      ...prevState,
      extractionState: {
        fileId,
        fileUrl,
        isExtracting: true,
        completed: false,
        error: null,
      }
    }));
  }, []);

  const setFileListRefreshHandler = useCallback((handler: () => void) => {
    fileListRefreshHandler.current = handler;
  }, []);

  const clearError = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      error: null,
      extractionState: {
        ...prevState.extractionState,
        error: null,
      },
    }));
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo<PDFViewerContextType>(() => ({
    ...state,
    handleShowFile,
    handleHideFileDisplay,
    fetchPapers,
    handleTextExtractionComplete,
    clearError,
    triggerExtraction,
    setFileListRefreshHandler,
  }), [
    state,
    handleShowFile,
    handleHideFileDisplay,
    fetchPapers,
    handleTextExtractionComplete,
    clearError,
    triggerExtraction,
    setFileListRefreshHandler,
  ]);

  return (
    <PDFViewerContext.Provider value={contextValue}>
      {children}
      
      {/* Render the hidden extractor if needed */}
      {state.extractionState.isExtracting && state.extractionState.fileId && state.extractionState.fileUrl && (() => {
        console.log('PDFViewerContext: Rendering PdfExtractor with:', {
          fileId: state.extractionState.fileId,
          fileUrl: state.extractionState.fileUrl,
          isExtracting: state.extractionState.isExtracting
        });
        return (
          <div className="hidden-extractor-wrapper" style={{ 
            position: 'fixed', 
            left: '-9999px',
            width: '800px',
            height: '600px',
            zIndex: -1
          }}>
            <PdfExtractor
              key={`extractor-${state.extractionState.fileId}`}
              fileId={state.extractionState.fileId}
              fileUrl={state.extractionState.fileUrl}
              onExtractionComplete={handleTextExtractionComplete}
              onExtractionProgress={(progress) => {
                console.log('Text extraction progress:', progress);
              }}
            />
          </div>
        );
      })()}
    </PDFViewerContext.Provider>
  );
};
