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
      completed: false
    }
  });

  // Store reference to file list refresh handler
  const fileListRefreshHandler = React.useRef<(() => void) | null>(null);

  const handleShowFile = useCallback(async (fileId: string, textSnippet: string) => {
    if (!fileId) {
      console.error('Invalid file ID provided to handleShowFile');
      return;
    }

    console.log('textSnippet test 2:', textSnippet);
    
    // First clean up any existing viewers to prevent conflicts
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
      if (data && data.storage_path) {
        console.log('File path from API:', data.storage_path);
        // Make sure the path is a string and not undefined
        const filePath = `https://storage.googleapis.com/refdoc-ai-bucket/${data.storage_path}`;
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
  }, []);

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
          const response: AppFile = await api.get(`/api/files`, {
            params: { fileId: prevState.currentFileId }
          });
          
          // If we have a selected paper, update it with the fresh data
          if (response) {
            setState(currentState => ({
              ...currentState,
              currentFileId: response.id,
              currentFilePath: `https://storage.googleapis.com/refdoc-ai-bucket/${response.storage_path}` || null,
              currentFile: response,
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
  }, []);

  const handleTextExtractionComplete = useCallback((success: boolean) => {
    if (success) {
      // Update extraction state
      setState(prevState => ({
        ...prevState,
        extractionState: {
          ...prevState.extractionState,
          isExtracting: false,
          completed: true
        }
      }));
      
      // Refresh the paper list to get the updated textExtracted status
      fetchPapers();
      
      // Call the file list refresh handler if available
      if (fileListRefreshHandler.current) {
        fileListRefreshHandler.current();
      }
    } else {
      setState(prevState => ({
        ...prevState,
        error: 'Text extraction failed',
        extractionState: {
          ...prevState.extractionState,
          isExtracting: false,
          completed: false
        }
      }));
    }
  }, [fetchPapers]);

  const triggerExtraction = useCallback((fileId: string, fileUrl: string) => {
    console.log('Triggering extraction for file:', fileId, fileUrl);
    setState(prevState => ({
      ...prevState,
      extractionState: {
        fileId,
        fileUrl,
        isExtracting: true,
        completed: false
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
      {state.extractionState.isExtracting && state.extractionState.fileId && state.extractionState.fileUrl && (
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
      )}
    </PDFViewerContext.Provider>
  );
};
