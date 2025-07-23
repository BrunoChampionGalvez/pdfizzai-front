'use client';

import { useState, useEffect } from 'react';
import { useFileSystemStore } from '../store/filesystem';
import { fileSystemService } from '../services/filesystem';
import { useUIStore } from '../store/ui';
import { useSubscriptionStore } from '../store/subscription';
import { subscriptionService } from '../services/subscription';
import FolderTree from './FolderTree';
import FileUploader from './FileUploader';

export default function Sidebar() {
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const { isSidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { currentFolderId, addFolder } = useFileSystemStore();
  const { getFilePagesRemaining, hasExceededFileLimit, getCurrentFilePagesLimit } = useSubscriptionStore();

  // Check if user has app access for enabling/disabling features
  const hasAppAccess = subscriptionService.hasAppAccess();

  // Function to handle sidebar collapse/expand
  const toggleSidebar = () => {
    setSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !hasAppAccess) return;
    
    try {
      const newFolder = await fileSystemService.createFolder(
        newFolderName,
        currentFolderId || undefined
      );
      addFolder(newFolder);
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (error) {
      console.error('Failed to create folder', error);
    }
  };

  return (
    <div className="relative flex h-full">
      {/* Sidebar */}
      <aside 
        className={`h-full bg-background-secondary flex flex-col transition-all duration-300 ease-in-out shadow-md ${
          isSidebarCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-80 opacity-100'
        }`}
      >
        <div className="p-4 relative mb-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-text-primary">My Documents</h2>
            <button
              onClick={toggleSidebar}
              className="text-text-primary hover:text-accent transition-colors p-1 rounded-md focus:outline-none cursor-pointer"
              title="Hide sidebar"
            >
              <HamburgerIcon />
            </button>
          </div>

          {isCreatingFolder && (
            <form onSubmit={handleCreateFolder} className="mb-4 bg-background-primary/20 p-3 rounded-lg shadow-sm">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="bg-background-secondary border border-secondary text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:border-accent transition-colors duration-200 w-full mb-2"
                autoFocus
              />
              <div className="flex space-x-2">
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-300 text-primary px-3 py-1 rounded-lg transition-colors duration-200 text-sm flex-1 cursor-pointer"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="bg-background-secondary hover:bg-background-primary text-text-primary px-3 py-1 rounded-lg transition-colors duration-200 text-sm flex-1 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* File count indicator */}
          {hasAppAccess && getFilePagesRemaining() <= 10 && getFilePagesRemaining() > 0 && (
            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <svg className="h-4 w-4 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.856-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-yellow-800 font-medium text-sm">Low file count</p>
                  <p className="text-yellow-700 text-xs">
                    {getFilePagesRemaining()} of {getCurrentFilePagesLimit()} uploads remaining.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 p-3 rounded-lg shadow-sm bg-background-primary/10">
            <button
              onClick={() => hasAppAccess && setIsCreatingFolder(true)}
              disabled={!hasAppAccess}
              className={`flex items-center justify-center w-full font-semibold py-2 px-4 rounded-lg transition-colors duration-200 ${
                hasAppAccess 
                  ? 'bg-accent hover:bg-accent-300 text-primary cursor-pointer' 
                  : 'bg-accent/30 text-primary/60 cursor-not-allowed'
              }`}
              title={!hasAppAccess ? 'Subscribe to create folders' : 'Create a new folder'}
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
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" 
                />
              </svg>
              Create New Folder
            </button>
            
            <FileUploader disabled={!hasAppAccess} />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="bg-background-primary/10 p-3 rounded-lg h-full">
            <FolderTree />
          </div>
        </div>
      </aside>

      {/* Toggle button when sidebar is collapsed */}
      <button
        onClick={toggleSidebar}
        className={`absolute top-5 left-2 cursor-pointer text-text-primary hover:text-accent bg-background-header p-2 rounded-full shadow-md transition-opacity duration-300 z-10 ${
          isSidebarCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        title="Show sidebar"
      >
        <HamburgerIcon />
      </button>
    </div>
  );
}

// Simple folder icon component
function FolderIcon({ className = 'w-6 h-6' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
      />
    </svg>
  );
}

// Hamburger menu icon component
function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}
