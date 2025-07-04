'use client';

import { useState } from 'react';
import { useChatStore } from '../store/chat';
import { useFileSystemStore } from '../store/filesystem';
import { File as FileType, fileSystemService } from '../services/filesystem';
import { formatFileSize } from '../lib/utils';
import Modal from './Modal';

interface FileListProps {
  files: FileType[];
}

export default function FileList({ files }: FileListProps) {
  const { setCurrentReference } = useChatStore();
  const { removeFile, addFile } = useFileSystemStore();
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileType | null>(null);
  
  const handleFileClick = (file: FileType) => {
    setCurrentReference({
      fileId: file.id,
      page: 1,
      text: ''
    });
  };

  // Drag handlers for files
  const handleFileDragStart = (fileId: string, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFile(fileId);
    
    // Create custom ghost image
    const file = files.find(f => f.id === fileId);
    if (file) {
      const ghostElement = document.createElement('div');
      ghostElement.textContent = file.filename;
      ghostElement.className = 'bg-background-secondary text-text-primary p-2 rounded-md border border-accent';
      document.body.appendChild(ghostElement);
      e.dataTransfer.setDragImage(ghostElement, 0, 0);
      
      // Set data for external drop handlers
      e.dataTransfer.setData('application/refery-file', fileId);
      
      // Remove ghost element after drag starts
      setTimeout(() => {
        document.body.removeChild(ghostElement);
      }, 0);
    }
  };
  
  const handleFileDragEnd = () => {
    setDraggedFile(null);
  };

  // Delete file handler
  const handleDeleteClick = (e: React.MouseEvent, file: FileType) => {
    e.stopPropagation();
    setFileToDelete(file);
    setDeleteModalOpen(true);
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    
    try {
      await fileSystemService.deleteFile(fileToDelete.id);
      removeFile(fileToDelete.id);
      setDeleteModalOpen(false);
      setFileToDelete(null);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };
  
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg p-2 mb-4 bg-background-secondary/30">
      <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2 px-2">Files</h3>
      <div className="space-y-1">
        {files.map((file) => (
          <FileItem 
            key={file.id} 
            file={file} 
            onClick={() => handleFileClick(file)}
            onDeleteClick={(e) => handleDeleteClick(e, file)}
            onDragStart={() => {
              setDraggedFile(file.id);
            }}
            onDragEnd={handleFileDragEnd}
            isDragging={draggedFile === file.id}
          />
        ))}
      </div>
      
      {/* Delete File Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setFileToDelete(null);
        }}
        title="Delete File"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-primary">
            Are you sure you want to delete the file "{fileToDelete?.filename}"? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => {
                setDeleteModalOpen(false);
                setFileToDelete(null);
              }}
              className="px-4 py-2 text-sm font-medium text-text-primary bg-background-secondary rounded-md hover:bg-background-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteFile}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-300 rounded-md hover:bg-accent-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FileItem({ 
  file, 
  onClick, 
  onDeleteClick,
  onDragStart,
  onDragEnd,
  isDragging
}: { 
  file: FileType, 
  onClick: () => void,
  onDeleteClick: (e: React.MouseEvent) => void,
  onDragStart: () => void,
  onDragEnd: () => void,
  isDragging: boolean
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a custom ghost image
    const ghostElement = document.createElement('div');
    ghostElement.textContent = file.filename;
    ghostElement.className = 'bg-background-secondary text-text-primary p-2 rounded-md border border-accent w-max';
    document.body.appendChild(ghostElement);
    e.dataTransfer.setDragImage(ghostElement, 0, 0);
    
    // Set data for external handlers
    e.dataTransfer.setData('application/refery-file', file.id);
    
    // Call the parent handler
    onDragStart();
    
    // Remove the ghost element after drag starts
    setTimeout(() => {
      document.body.removeChild(ghostElement);
    }, 0);
  };
  
  return (
    <div 
      className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer group ${
        isDragging ? 'opacity-50' : 'hover:bg-accent/10 text-text-primary'
      }`}
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
    >
      <FileIcon />
      <div className="ml-2 flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className="text-sm truncate text-text-primary">{file.filename}</span>
          <div className="flex items-center">
            <span className="text-xs text-text-secondary mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatFileSize(file.size_bytes)}
            </span>
            <button
              onClick={onDeleteClick}
              className="text-text-primary hover:text-accent-300 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none cursor-pointer"
              title="Delete file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// File icon component
function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
      />
    </svg>
  );
}
