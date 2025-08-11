'use client';

import { useState, useRef } from 'react';
import { useFileSystemStore } from '../store/filesystem';
import { useSubscriptionStore } from '../store/subscription';
import { useAuthStore } from '../store/auth';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { useChatStore } from '../store/chat';
import { File, fileSystemService } from '../services/filesystem';
import { subscriptionService } from '../services/subscription';
import { useToast } from './ToastProvider';
import { PDFDocument } from 'pdf-lib';

interface FileUploaderProps {
  folderId?: string | null;
  onUploadComplete?: () => void;
  isIcon?: boolean;
  disabled?: boolean;
}

export default function FileUploader({ folderId, onUploadComplete, isIcon = false, disabled = false }: FileUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentFolderId, addFile, removeFile } = useFileSystemStore();
  const { hasExceededFileLimit, getFilePagesRemaining } = useSubscriptionStore();
  const { user } = useAuthStore();
  const { handleShowFile } = usePDFViewer();
  const { setCurrentReference } = useChatStore();
  const { showError } = useToast();

  const targetFolderId = folderId !== undefined ? folderId : currentFolderId;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let totalPages = 0;
    for (let i = 0; i < files.length; i++) {
      const arrayBuffer = await files[i].arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      totalPages += pdfDoc.getPageCount();
      if (totalPages > getFilePagesRemaining()) {
        showError('Files exceed pages available', 'Please upload files with fewer pages.');
        // Clear the input value to allow trying again later
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    }

    if (files.length > getFilePagesRemaining()) {
      showError('File upload limit reached', `You tried to upload ${files.length} files and only ${getFilePagesRemaining()} file upload${getFilePagesRemaining() === 1 ? '' : 's'} remain${getFilePagesRemaining() === 1 ? 's' : ''}, please upload fewer files or upgrade your plan.`);
      // Clear the input value to allow trying again later
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Check if user can upload files (hasn't exceeded limit)
    if (!subscriptionService.canUploadFiles()) {
      // Clear the input value to allow trying again later
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Check if uploading these files would exceed the limit
    const filesRemaining = getFilePagesRemaining();
    if (files.length > filesRemaining) {
      // Clear the input value to allow trying again later
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

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
        
        // Add a temporary loading file to the store immediately
        const tempFileId = `temp-${Date.now()}-${i}`;
        const loadingFile: File = {
          id: tempFileId,
          filename: '', // Empty filename to trigger loading state
          mime_type: file.type,
          size_bytes: file.size,
          folder_id: targetFolderId || null,
          upload_date: new Date().toISOString(),
          storage_path: '',
          textExtracted: false,
          processed: false
        };
        addFile(loadingFile);
        
        try {
          const uploadedFile = await fileSystemService.uploadFile(
            file,
            targetFolderId || undefined
          );
          
          // Remove the temporary loading file and add the real file
          removeFile(tempFileId);
          addFile(uploadedFile);
        
          // Check if this is a PDF file that needs extraction
          if (file.type === 'application/pdf' && uploadedFile) {
            console.log('Setting up PDF extraction for:', uploadedFile.id);
            console.log('Initial uploadedFile storage_path:', uploadedFile.storage_path);
            
            // Set the current reference and show the file in the PDF viewer
            setCurrentReference({
              fileId: uploadedFile.id,
              page: 1,
              text: ''
            });
            
            // Show the file in the PDF viewer
            await handleShowFile(uploadedFile.id, '');
            
            // Note: Text extraction is now handled automatically in the backend during upload
            console.log('File uploaded successfully. Text extraction completed in backend.');
          }
        } catch (uploadError) {
          console.error('Failed to upload file:', uploadError);
          // Remove the temporary loading file on error
          removeFile(tempFileId);
          throw uploadError;
        }
      }

      clearInterval(interval);
      setUploadProgress(100);
      
      // Refresh files count after successful upload
      if (user?.id) {
        await subscriptionService.refreshFilesCount(user.id);
      }
      
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
    if (disabled || isUploading || hasExceededFileLimit()) return;
    fileInputRef.current?.click();
  };

  if (isIcon) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          //multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading || hasExceededFileLimit() || disabled}
        />
        <button
          onClick={handleClick}
          disabled={isUploading || hasExceededFileLimit() || disabled}
          className={`text-text-primary transition-colors focus:outline-none ${
        hasExceededFileLimit() || disabled ? 'cursor-not-allowed opacity-60' : 'hover:text-accent cursor-pointer'
          }`}
          title={
        disabled
          ? "Subscribe to upload files"
          : hasExceededFileLimit()
          ? "You've reached your file upload limit"
          : "Upload file"
          }
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
          isUploading || hasExceededFileLimit() || disabled
            ? 'bg-accent/30 cursor-not-allowed'
            : 'bg-accent hover:bg-accent-300 cursor-pointer'
        } text-primary font-semibold py-2 px-4 rounded-lg transition-colors duration-200 ${
          (isUploading || hasExceededFileLimit() || disabled) ? 'text-primary/60' : ''
        }`}
        onClick={isIcon ? handleClick : undefined}
        title={
          disabled ? "Subscribe to upload files" :
          hasExceededFileLimit() ? "You've reached your file upload limit" :
          "Upload PDF files"
        }
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
        {isUploading ? `Uploading... ${uploadProgress}%` : 
         disabled ? 'Upload Disabled' :
         hasExceededFileLimit() ? 'Upload Limit Reached' : 'Upload PDF'}
      </label>
      <input
        ref={fileInputRef}
        id={isIcon ? undefined : "file-upload"}
        type="file"
        accept=".pdf"
        //multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading || hasExceededFileLimit() || disabled}
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
