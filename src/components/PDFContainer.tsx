'use client';

import { useChatStore } from '../store/chat';
import { useUIStore } from '../store/ui';
import { useEffect, useState } from 'react';
import { PdfViewer } from './pdf-express';
import { usePDFViewer } from '../contexts/PDFViewerContext';

export default function PDFViewer() {
  const { currentReference } = useChatStore();
  const { isSidebarCollapsed } = useUIStore();
  const [mounted, setMounted] = useState(false);
  
  const {
    isLoadingFile,
    currentFilePath,
    currentFile,
    textSnippet,
    showFileDisplay,
    currentFileId,
    error,
    handleShowFile,
    handleTextExtractionComplete,
    clearError
  } = usePDFViewer();



  // Handle initial animation
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!currentReference?.fileId) {
    return null;
  }

  if (!currentReference?.fileId) {
    return null;
  }

  return (
    <div 
      className={`flex flex-col bg-background-secondary border-r border-secondary transition-all duration-300 ease-in-out ${
        mounted ? (
          isSidebarCollapsed 
            ? 'w-3/4 opacity-100' // Take 75% when sidebar is collapsed
            : 'w-2/3 opacity-100'  // Take 66% when sidebar is visible
        ) : 'w-0 opacity-0'
      }`}
    >
      <div className="h-full flex flex-col">
        {/* Header with close button removed; close control now in CustomPdfViewer */}
        
        <div className="flex-1 bg-background-primary rounded-lg flex items-center justify-center">
          {isLoadingFile ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--primary)]"></div>
                </div>
              ) : error ? (
                <div className="flex flex-col justify-center items-center h-full text-red-500">
                  <p className="mb-2">Error: {error}</p>
                  <button 
                    className="px-4 py-2 bg-accent text-white rounded hover:bg-accent-300 transition-colors"
                    onClick={clearError}
                  >
                    Clear Error
                  </button>
                </div>
              ) : currentFilePath && showFileDisplay ? (() => {
                console.log('PDFContainer: Rendering PDF viewer with:', {
                  currentFilePath,
                  showFileDisplay,
                  currentFileId,
                  textExtracted: currentFile?.textExtracted
                });
                return (
                  <PdfViewer 
                    pdfUrl={currentFilePath}
                    textSnippet={textSnippet} 
                    paperId={currentFileId}
                    shouldExtractText={!currentFile?.textExtracted}
                    onTextExtractionComplete={handleTextExtractionComplete}
                  />
                );
              })() : (() => {
                console.log('PDFContainer: Showing "No file content available" with state:', {
                  currentFilePath,
                  showFileDisplay,
                  currentFileId,
                  isLoadingFile,
                  error
                });
                return (
                  <div className="flex flex-col justify-center items-center h-full text-gray-500">
                    <p>No file content available</p>
                    {currentFileId && !currentFilePath && (
                      <button 
                        className="mt-4 px-4 py-2 bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-dark)] transition-colors"
                        onClick={() => currentFileId && handleShowFile(currentFileId, textSnippet)}
                      >
                        Retry loading file
                      </button>
                    )}
                  </div>
                );
              })()}
        </div>
      </div>
    </div>
  );
}