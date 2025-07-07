'use client';

import { useState, useRef } from 'react';
import { useFileSystemStore } from '../store/filesystem';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { fileSystemService } from '../services/filesystem';
import api from '../lib/api';

interface FileUploaderProps {
  folderId?: string | null;
  onUploadComplete?: () => void;
  isIcon?: boolean;
}

export default function FileUploader({ folderId, onUploadComplete, isIcon = false }: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentFolderId, addFile } = useFileSystemStore();
  const { triggerExtraction } = usePDFViewer();
  
  const targetFolderId = folderId !== undefined ? folderId : currentFolderId;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // In a real implementation, you would track progress with axios
      // Here we'll simulate progress
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploadedFile = await fileSystemService.uploadFile(
          file as any,
          targetFolderId || undefined
        );
        addFile(uploadedFile);
        
        // Check if this is a PDF file that needs extraction
        if (file.type === 'application/pdf' && uploadedFile) {
          console.log('Setting up PDF extraction for:', uploadedFile.id);
          
          // Try to construct the file URL - we'll need to fetch the file details to get the storage_path
          try {
            // Fetch the complete file information
            const response = await api.get(`/api/files/${uploadedFile.id}`);
            const fileDetails = response.data;
            if (fileDetails && fileDetails.storage_path && !fileDetails.textExtracted) {
              const fileUrl = `https://storage.googleapis.com/refdoc-ai-bucket/${fileDetails.storage_path}`;
              
              // Trigger extraction
              triggerExtraction(uploadedFile.id, fileUrl);
              
              console.log('PDF extraction will begin for:', fileUrl);
            }
          } catch (error) {
            console.error('Failed to fetch file details for extraction:', error);
          }
        }
      }

      clearInterval(interval);
      setUploadProgress(100);
      
      // Reset after a short delay
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        if (onUploadComplete) onUploadComplete();
      }, 1000);
      
      // Clear the input value to allow uploading the same file again
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    } catch (error) {
      console.error('Failed to upload file', error);
      setIsUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  if (isIcon) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <button
          onClick={handleClick}
          disabled={isUploading}
          className="text-text-primary hover:text-accent transition-colors focus:outline-none cursor-pointer"
          title="Upload file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      </>
    );
  }

  return (
    <div>
      <label
        htmlFor={isIcon ? undefined : "file-upload"}
        className={`flex items-center justify-center w-full ${
          isUploading
            ? 'bg-accent bg-opacity-50 cursor-not-allowed'
            : 'bg-accent hover:bg-accent-300 cursor-pointer'
        } text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200`}
        onClick={isIcon ? handleClick : undefined}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5 mr-2" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
          />
        </svg>
        {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload PDF'}
      </label>
      <input
        ref={fileInputRef}
        id={isIcon ? undefined : "file-upload"}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />

      {isUploading && (
        <div className="mt-2 bg-background-primary rounded-full h-2 overflow-hidden">
          <div
            className="bg-accent transition-all duration-300 ease-out"
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      )}
    </div>
  );
}
