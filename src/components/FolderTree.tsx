'use client';

import { useState, useEffect, useRef } from 'react';
import { useFileSystemStore } from '../store/filesystem';
import { useSubscriptionStore } from '../store/subscription';
import { useAuthStore } from '../store/auth';
import { fileSystemService, Folder, File as FileType } from '../services/filesystem';
import { subscriptionService } from '../services/subscription';
import { useChatStore } from '../store/chat';
import { usePDFViewer } from '../contexts/PDFViewerContext';
import { formatFileSize } from '../lib/utils';
import { LoadingIcon } from './ChatPane';
import Modal from './Modal';
import FileUploader from './FileUploader';
import api from '../lib/api';

export default function FolderTree() {
  const { folders, files, currentFolderId, setCurrentFolderId, isLoading, addFolder, removeFolder, removeFile, addFile, setFiles } = useFileSystemStore();
  const { hasExceededFileLimit, getFilePagesRemaining, getCurrentFilePagesLimit } = useSubscriptionStore();
  const { user } = useAuthStore();
  
  // Check if user has app access for enabling/disabling features
  const hasAppAccess = subscriptionService.hasAppAccess();
  
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [draggedItem, setDraggedItem] = useState<{ type: 'folder' | 'file', id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState<string[]>([]);
  const [viewStartLevel, setViewStartLevel] = useState(0);
  const [currentViewFolderId, setCurrentViewFolderId] = useState<string | null>(null); // Track which folder we're currently viewing
  const [navigationHistory, setNavigationHistory] = useState<Array<{ viewStartLevel: number, currentViewFolderId: string | null }>>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'folder' | 'file', id: string, name: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  // PDF and chat integration
  const { setCurrentReference } = useChatStore();
  const { handleShowFile, setFileListRefreshHandler, triggerExtraction } = usePDFViewer();
  const [fileListRefreshHandler, setFileListRefreshHandlerState] = useState<(() => void) | null>(null);

  // Initialize breadcrumb with root
  useEffect(() => {
    if (breadcrumbPath.length === 0) {
      setBreadcrumbPath(['root']);
    }
  }, [breadcrumbPath.length]);

  // Register the file refresh handler when component mounts
  useEffect(() => {
    const refreshFiles = async () => {
      try {
        console.log('Refreshing files after extraction completion');
        const { files: updatedFiles } = await fileSystemService.getFolders(currentFolderId || undefined);
        setFiles(updatedFiles);
      } catch (error) {
        console.error('Failed to refresh files:', error);
      }
    };
    
    setFileListRefreshHandler(refreshFiles);
    setFileListRefreshHandlerState(() => refreshFiles);
    
    // Cleanup on unmount
    return () => {
      setFileListRefreshHandler(() => {});
    };
  }, [setFileListRefreshHandler, currentFolderId, setFiles]);

  // Calculate maximum depth that can fit in the sidebar (fixed at 3 levels)
  const getMaxDepth = () => {
    return 3; // Always show exactly 3 levels
  };

  // Track the maximum depth in current folder structure
  const getDeepestLevel = (folderId: string | null, currentDepth: number = 0): number => {
    const childFolders = folders.filter(f => f.parent_id === folderId);
    if (childFolders.length === 0) {
      return currentDepth;
    }
    
    return Math.max(...childFolders.map(child => 
      getDeepestLevel(child.id, currentDepth + 1)
    ));
  };

  // Debug: Log the folder tree state
  const maxDepth = folders.length > 0 ? getDeepestLevel(null) : 0;
  console.log('FolderTree Debug:', { 
    foldersCount: folders.length, 
    filesCount: files.length,
    viewStartLevel,
    currentViewFolderId,
    maxDepth,
    navigationHistoryLength: navigationHistory.length,
    showingLevels: currentViewFolderId ? `Inside folder: ${folders.find(f => f.id === currentViewFolderId)?.name}` : `${viewStartLevel + 1}-${viewStartLevel + 3}`,
    isLoading 
  });

  // Initialize view to always start at level 0 (showing levels 1-3)
  useEffect(() => {
    // Reset to level 0 on component mount
    setViewStartLevel(0);
  }, []);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Handle folder expand/collapse and navigation when clicking third level
  const handleFolderToggle = (folderId: string, e: React.MouseEvent, depth: number = 0) => {
    e.stopPropagation();
    
    console.log('handleFolderToggle called:', { folderId, depth, viewStartLevel, currentViewFolderId });
    
    // If this is the third visible level (depth 2, since depth is 0-indexed), 
    // and the folder has children, navigate into that folder
    if (depth === 2) {
      const folderHasChildren = folders.some(f => f.parent_id === folderId) || files.some(f => f.folder_id === folderId);
      
      console.log('Third level folder clicked:', { folderId, folderHasChildren, depth });
      
      // Always navigate into this folder if it has children
      if (folderHasChildren) {
        console.log('Navigating into folder:', folderId);
        
        // Save current view to history
        setNavigationHistory(prev => [...prev, { viewStartLevel, currentViewFolderId }]);
        
        // Calculate the absolute depth of this folder to set as new view level
        const getAbsoluteDepth = (targetFolderId: string): number => {
          if (currentViewFolderId) {
            // If we're already inside a folder, this is relative to that folder
            const folder = folders.find(f => f.id === targetFolderId);
            if (!folder) return 0;
            
            // Find the depth from the current view folder
            let tempFolderId = folder.parent_id;
            let depth = 0;
            
            while (tempFolderId && tempFolderId !== currentViewFolderId) {
              depth++;
              const tempFolder = folders.find(f => f.id === tempFolderId);
              if (!tempFolder) break;
              tempFolderId = tempFolder.parent_id;
            }
            
            return depth; // Return the depth of the folder itself, not +1
          } else {
            // Calculate absolute depth from root - this is the depth OF the folder
            const folder = folders.find(f => f.id === targetFolderId);
            if (!folder) return 0;
            
            let tempFolderId = folder.parent_id;
            let depth = 0;
            
            while (tempFolderId) {
              depth++;
              const tempFolder = folders.find(f => f.id === tempFolderId);
              if (!tempFolder || !tempFolder.parent_id) break;
              tempFolderId = tempFolder.parent_id;
            }
            
            return depth; // Return the depth of the folder itself
          }
        };
        
        const absoluteDepth = getAbsoluteDepth(folderId);
        console.log('Setting new view with folder as root:', { folderId, absoluteDepth });
        
        // Show this folder as the new first level (not inside it)
        setCurrentViewFolderId(null);
        setViewStartLevel(absoluteDepth);
        
        // Expand the folder we're navigating to
        setExpandedFolders(prev => ({
          ...prev,
          [folderId]: true
        }));
        return;
      }
    }
    
    console.log('Regular toggle for folder:', folderId);
    // Regular toggle behavior for other levels
    toggleFolder(folderId);
  };

  // Handle file click with PDF integration
  const handleFileClick = async (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Set the current reference in the chat store for layout management
    setCurrentReference({
      fileId: file.id,
      page: 1,
      text: ''
    });
    
    // Show the file in the PDF viewer
    await handleShowFile(file.id, '');
    
    // Check if this is a PDF file that needs extraction
    if (file.mime_type === 'application/pdf') {
      try {
        // Fetch the complete file information to check if extraction is needed
        const response = await api.get(`/api/files/${file.id}`);
        const fileDetails = response.data;
        
        if (fileDetails && fileDetails.storage_path && !fileDetails.textExtracted) {
          console.log('PDF file needs extraction, triggering extraction for:', file.id);
          const fileUrl = `https://storage.googleapis.com/refdoc-ai-bucket/${fileDetails.storage_path}`;
          triggerExtraction(file.id, fileUrl);
        }
      } catch (error) {
        console.error('Failed to check file extraction status:', error);
      }
    }
  };

  // Navigation for breadcrumb
  const navigateToLevel = (level: number) => {
    setViewStartLevel(level);
  };

  const goBack = () => {
    if (navigationHistory.length > 0) {
      // Go back to the previous view from history
      const previousView = navigationHistory[navigationHistory.length - 1];
      setViewStartLevel(previousView.viewStartLevel);
      setCurrentViewFolderId(previousView.currentViewFolderId);
      
      // Remove the last item from history
      setNavigationHistory(prev => prev.slice(0, -1));
    }
  };



  // Get the folder name at a specific level for breadcrumb display
  const getFolderAtLevel = (level: number): Folder | null => {
    if (level === 0) return null; // Root level
    
    let currentFolders = folders.filter(f => f.parent_id === null);
    
    for (let i = 1; i <= level; i++) {
      if (currentFolders.length === 0) return null;
      
      if (i === level) {
        return currentFolders[0] || null;
      }
      
      // Get children of the first folder in current level
      const nextFolders = folders.filter(f => f.parent_id === currentFolders[0].id);
      currentFolders = nextFolders;
    }
    
    return null;
  };

  // Handler for creating a new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const newFolder = await fileSystemService.createFolder(newFolderName, newFolderParentId || undefined);
      addFolder(newFolder);
      setNewFolderName('');
      setShowNewFolderModal(false);
      
      // Expand the parent folder to show the new folder
      if (newFolderParentId) {
        setExpandedFolders(prev => ({
          ...prev,
          [newFolderParentId]: true
        }));
        
        // Calculate the depth of the new folder and adjust view if needed
        const getParentDepth = (folderId: string, depth: number = 0): number => {
          const folder = folders.find(f => f.id === folderId);
          if (!folder || !folder.parent_id) return depth;
          return getParentDepth(folder.parent_id, depth + 1);
        };
        
        const newFolderDepth = getParentDepth(newFolderParentId) + 1;
        
        // If the new folder is beyond the current view (depth > viewStartLevel + 2), 
        // adjust the view to show it in the last visible level
        if (newFolderDepth > viewStartLevel + 2) {
          setViewStartLevel(Math.max(0, newFolderDepth - 2));
        }
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  // Handler for opening the new folder modal
  const openNewFolderModal = (parentId: string | null) => {
    setNewFolderParentId(parentId);
    setNewFolderName('');
    setShowNewFolderModal(true);
  };

  // Handler for deleting a folder or file
  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    // For folders, require typing the folder name as confirmation
    if (itemToDelete.type === 'folder' && confirmText !== itemToDelete.name) {
      return;
    }
    
    try {
      if (itemToDelete.type === 'folder') {
        await fileSystemService.deleteFolder(itemToDelete.id);
        removeFolder(itemToDelete.id);
        
        // If we deleted the current folder, navigate to its parent or root
        if (currentFolderId === itemToDelete.id) {
          const folderToDelete = folders.find(f => f.id === itemToDelete.id);
          setCurrentFolderId(folderToDelete?.parent_id || null);
        }
      } else {
        await fileSystemService.deleteFile(itemToDelete.id);
        removeFile(itemToDelete.id);
        
        // Refresh files count after successful deletion
        if (user?.id) {
          await subscriptionService.refreshFilesCount(user.id);
        }
      }
      
      setDeleteModalOpen(false);
      setItemToDelete(null);
      setConfirmText('');
    } catch (error) {
      console.error(`Failed to delete ${itemToDelete.type}:`, error);
    }
  };

  // Handler for initiating deletion of a folder or file
  const openDeleteModal = (type: 'folder' | 'file', id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToDelete({ type, id, name });
    setConfirmText('');
    setDeleteModalOpen(true);
  };
  
  // Drag and drop handlers for files
  const handleFileDragStart = (fileId: string, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem({ type: 'file', id: fileId });
    
    // Create custom ghost image
    const file = files.find(f => f.id === fileId);
    if (file) {
      const ghostElement = document.createElement('div');
      ghostElement.textContent = file.filename ?? 'File loading...';
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
    setDraggedItem(null);
  };
  
  // Folder drag handlers
  const handleFolderDragStart = (folderId: string, e: React.DragEvent) => {
    setDraggedItem({ type: 'folder', id: folderId });
    
    // Set the drag image and effect
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      
      // Create a custom ghost image
      const ghostElement = document.createElement('div');
      ghostElement.textContent = folders.find(f => f.id === folderId)?.name || 'Folder';
      ghostElement.className = 'bg-background-secondary text-text-primary p-2 w-max rounded-md border border-accent';
      document.body.appendChild(ghostElement);
      e.dataTransfer.setDragImage(ghostElement, 0, 0);
      
      // Remove the ghost element after drag starts
      setTimeout(() => {
        document.body.removeChild(ghostElement);
      }, 0);
    }
  };
  
  const handleDragOver = (folderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    if (
      (draggedItem && draggedItem.id !== folderId) || 
      (!draggedItem && e.dataTransfer.types.includes('application/refery-file'))
    ) {
      setDropTarget(folderId);
      e.dataTransfer.dropEffect = 'move';
    }
  };
  
  const handleDragLeave = () => {
    setDropTarget(null);
  };
  
  const handleDrop = async (folderId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    
    // Handle file dragged from FileList
    if (!draggedItem && e.dataTransfer.types.includes('application/refery-file')) {
      const fileId = e.dataTransfer.getData('application/refery-file');
      const file = files.find(f => f.id === fileId);
      
      if (file && file.folder_id !== folderId) {
        try {
          // API call would go here in a real implementation
          // For now, we'll just update the local state
          const updatedFile = { ...file, folder_id: folderId };
          removeFile(file.id);
          addFile(updatedFile);
        } catch (error) {
          console.error('Failed to move file:', error);
        }
      }
      
      setDropTarget(null);
      return;
    }
    
    if (!draggedItem || draggedItem.id === folderId) {
      setDropTarget(null);
      setDraggedItem(null);
      return;
    }
    
    try {
      if (draggedItem.type === 'folder') {
        // Can't move a folder into its own descendant
        const targetFolder = folders.find(f => f.id === folderId);
        let currentParent = targetFolder;
        while (currentParent) {
          if (currentParent.id === draggedItem.id) {
            console.error("Cannot move a folder into its own descendant");
            setDropTarget(null);
            setDraggedItem(null);
            return;
          }
          const nextParent = folders.find(f => f.id === currentParent?.parent_id);
          currentParent = nextParent ? nextParent : undefined;
        }
        
        // Move the folder
        const folder = folders.find(f => f.id === draggedItem.id);
        if (folder) {
          // API call would go here in a real implementation
          // For now, we'll just update the local state
          const updatedFolder = { ...folder, parent_id: folderId };
          removeFolder(folder.id);
          addFolder(updatedFolder);
        }
      } else {
        // Move the file
        const file = files.find(f => f.id === draggedItem.id);
        if (file) {
          // API call would go here in a real implementation
          // For now, we'll just update the local state
          const updatedFile = { ...file, folder_id: folderId };
          removeFile(file.id);
          addFile(updatedFile);
        }
      }
    } catch (error) {
      console.error('Failed to move item:', error);
    }
    
    setDropTarget(null);
    setDraggedItem(null);
  };

  // Get folders to display at the current view level
  const getFoldersAtLevel = (level: number): Folder[] => {
    if (level === 0) {
      return folders.filter(folder => folder.parent_id === null);
    }
    
    // Find folders at the specified level
    let currentFolders = folders.filter(f => f.parent_id === null);
    
    for (let i = 1; i <= level; i++) {
      if (currentFolders.length === 0) break;
      
      const nextLevelFolders: Folder[] = [];
      for (const folder of currentFolders) {
        const children = folders.filter(f => f.parent_id === folder.id);
        nextLevelFolders.push(...children);
      }
      currentFolders = nextLevelFolders;
      
      if (i === level) {
        return currentFolders;
      }
    }
    
    return [];
  };

  // Get the folders that should be visible at the current viewStartLevel
  const getVisibleRootFolders = (): Folder[] => {
    if (viewStartLevel === 0) {
      // Show actual root folders (level 0)
      return folders.filter(folder => folder.parent_id === null);
    }
    
    // For higher levels, we need to find the specific folders at that depth
    // and return them as the new "root" folders
    let currentFolders = folders.filter(f => f.parent_id === null);
    
    for (let level = 1; level <= viewStartLevel; level++) {
      const nextLevelFolders: Folder[] = [];
      for (const folder of currentFolders) {
        const children = folders.filter(f => f.parent_id === folder.id);
        nextLevelFolders.push(...children);
      }
      currentFolders = nextLevelFolders;
    }
    
    // Return the folders at the viewStartLevel as the new root folders
    return currentFolders;
  };

  // Get the folders that should be treated as "root" for the current view
  const currentViewRootFolders = getVisibleRootFolders();
  
  // Debug: Log the visible folders
  console.log('Visible root folders for level', viewStartLevel, ':', currentViewRootFolders.map(f => f.name));

  // Recursive function to render hierarchical folder tree with files
  const renderFolderWithFiles = (folder: Folder, depth: number = 0) => {
    const isExpanded = expandedFolders[folder.id] || false;
    const childFolders = folders.filter(f => f.parent_id === folder.id);
    const folderFiles = files.filter(f => f.folder_id === folder.id);
    const hasContent = childFolders.length > 0 || folderFiles.length > 0;
    const isDropTarget = dropTarget === folder.id;
    const isDragging = draggedItem?.type === 'folder' && draggedItem.id === folder.id;
    
    // Calculate if this level should be visible based on depth constraints
    // Now depth is relative to the current view, not absolute
    const isVisible = depth < getMaxDepth();
    
    if (!isVisible) return null;
    
    return (
      <div key={folder.id} className="mb-1">
        <div 
          className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer group ${
            isDropTarget ? 'bg-background-primary/30' : 
            isDragging ? 'opacity-50' : 'hover:bg-accent/10'
          }`}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
          onClick={(e) => handleFolderToggle(folder.id, e, depth)}
          draggable
          onDragStart={(e) => handleFolderDragStart(folder.id, e)}
          onDragOver={(e) => handleDragOver(folder.id, e)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(folder.id, e)}
        >
          <button
            className="flex items-center focus:outline-none"
            onClick={(e) => handleFolderToggle(folder.id, e, depth)}
          >
            {hasContent && (
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 mr-1 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <FolderIcon expanded={isExpanded} />
          </button>
          <span className="ml-2 text-sm truncate flex-grow text-text-primary" title={folder.name}>{folder.name}</span>
          
          <div className="flex space-x-1 ml-2 opacity-0 group-hover:opacity-100">
            {/* New folder button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasAppAccess) openNewFolderModal(folder.id);
              }}
              disabled={!hasAppAccess}
              className={`transition-colors focus:outline-none ${
                hasAppAccess 
                  ? 'text-text-primary hover:text-accent cursor-pointer' 
                  : 'text-gray-400 cursor-not-allowed opacity-50'
              }`}
              title={hasAppAccess ? "New folder" : "Subscribe to create folders"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
            
            {/* Upload file button */}
            <FileUploader
              folderId={folder.id}
              isIcon={true}
              disabled={!hasAppAccess}
            />
            
            {/* Delete folder button */}
            <button
              onClick={(e) => openDeleteModal('folder', folder.id, folder.name, e)}
              className="text-text-primary hover:text-accent-300 transition-colors focus:outline-none cursor-pointer"
              title="Delete folder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Render folder contents when expanded */}
        {isExpanded && (
          <div className="mt-1">
            {/* Render child folders */}
            {childFolders.map(childFolder => renderFolderWithFiles(childFolder, depth + 1))}
            
            {/* Render files in this folder */}
            {folderFiles.map(file => renderFileItem(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Function to render individual file items
  const renderFileItem = (file: FileType, depth: number) => {
    const isDragging = draggedItem?.type === 'file' && draggedItem.id === file.id;
    const isVisible = depth < getMaxDepth();
    
    if (!isVisible) return null;
    
    return (
      <div 
        key={file.id}
        className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer group ${
          isDragging ? 'opacity-50' : 'hover:bg-accent/10 text-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={(e) => handleFileClick(file, e)}
        draggable
        onDragStart={(e) => handleFileDragStart(file.id, e)}
        onDragEnd={handleFileDragEnd}
      >
        {file.filename && <FileIcon />}
        <div className="ml-2 flex-1 min-w-0">
          <div className="flex justify-between items-center">
            {file.filename && file.filename.trim() !== '' ? (
              <span className="text-sm truncate text-text-primary" title={file.filename}>{file.filename}</span>
            ) : (
              <span className="text-sm flex items-center text-text-primary" title="File loading...">
                <LoadingIcon />
                <span className='ml-2'>File loading...</span>
              </span>
            )}
            <div className="flex items-center">
              <span className="text-xs text-text-secondary mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatFileSize(file.size_bytes)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal('file', file.id, file.filename || 'File', e);
                }}
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
  };

  // Render root files (files not in any folder) - only show at root level
  const renderRootFiles = () => {
    // Only show root files when we're viewing from the actual root level
    if (viewStartLevel > 0) return null;
    
    const rootFiles = files.filter(f => f.folder_id === null);
    
    if (rootFiles.length === 0) return null;
    
    return (
      <>
        {rootFiles.map(file => renderFileItem(file, 0))}
      </>
    );
  };

  if (isLoading) {
    return <div className="p-4 text-text-secondary text-sm">Loading...</div>;
  }

  return (
    <div ref={sidebarRef}>
      {/* Navigation controls for level management */}
      {(currentViewFolderId || viewStartLevel > 0 || navigationHistory.length > 0) && (
        <div className="mb-2 flex items-center justify-between bg-background-primary/20 p-2 rounded-md">
          {/* Back button */}
          {navigationHistory.length > 0 && (
            <button
              onClick={goBack}
              className="flex items-center text-accent hover:text-accent-300 text-sm transition-colors cursor-pointer"
              title="Go back to previous view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          
          {/* Level indicator */}
          <span className="text-xs text-text-secondary">
            {currentViewFolderId ? 
              `Inside: ${folders.find(f => f.id === currentViewFolderId)?.name || 'Folder'}` :
              `Levels ${viewStartLevel + 1}-${viewStartLevel + 3}`
            }
          </span>
        </div>
      )}

      {/* File limit warning */}
      {hasExceededFileLimit() && (
        <div className="mb-3 p-2 bg-red-100 border border-red-300 rounded-lg">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.856-.833-2.598 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-red-800 font-medium text-sm">File upload limit reached</p>
              <p className="text-red-700 text-xs">
                You have used all {getCurrentFilePagesLimit()} files allowed with your plan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Root level - only show when viewing from root */}
      {viewStartLevel === 0 && (
        <div 
          className={`flex items-center py-2 px-2 rounded-md cursor-pointer mb-2 ${
            dropTarget === null ? 'bg-accent/10' : 'hover:bg-accent/10'
          }`}
          onDragOver={(e) => handleDragOver(null, e)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(null, e)}
        >
          <HomeIcon />
          <span className="ml-2 text-sm font-medium text-text-primary">Home Folder</span>
          <div className="flex space-x-1 ml-auto">
            {/* New folder button for root level */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasAppAccess) openNewFolderModal(null);
              }}
              disabled={!hasAppAccess}
              className={`transition-colors focus:outline-none ${
                hasAppAccess 
                  ? 'hover:text-accent text-text-primary cursor-pointer' 
                  : 'text-gray-400 cursor-not-allowed opacity-50'
              }`}
              title={hasAppAccess ? "New folder" : "Subscribe to create folders"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
            
            {/* Upload file button for root level */}
            <FileUploader
              folderId={null}
              isIcon={true}
              disabled={!hasAppAccess}
            />
          </div>
        </div>
      )}

      {/* Hierarchical folder tree with files */}
      <div className='rounded-lg p-2 mb-4 bg-background-secondary/30'>
        <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2 px-2">
          Folders & Files
        </h3>
        
        {/* Render root files first */}
        {renderRootFiles()}
        
        {/* Render folders with their content */}
        {currentViewRootFolders.map(folder => renderFolderWithFiles(folder, 0))}
      </div>
      
      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
          setConfirmText('');
        }}
        title={`Delete ${itemToDelete?.type === 'folder' ? 'Folder' : 'File'}`}
      >
        <div className="space-y-4">
          {itemToDelete?.type === 'folder' ? (
            <>
              <p className="text-sm text-text-primary">
                Are you sure you want to delete the folder "{itemToDelete.name}" and all its contents? This action cannot be undone.
              </p>
              <div className="mt-2">
                <label htmlFor="confirm-text" className="block text-sm font-medium text-text-primary">
                  Type the folder name to confirm deletion:
                </label>
                <input
                  type="text"
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1 p-2 block w-full rounded-md border border-accent bg-sidebar-item text-text-primary focus:outline-none focus:ring-accent focus:border-accent"
                  placeholder={itemToDelete.name}
                  autoComplete="off"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-text-primary">
              Are you sure you want to delete the file "{itemToDelete?.name}"? This action cannot be undone.
            </p>
          )}
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => {
                setDeleteModalOpen(false);
                setItemToDelete(null);
                setConfirmText('');
              }}
              className="px-4 py-2 text-sm font-medium text-text-primary bg-primary-200 rounded-md hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={itemToDelete?.type === 'folder' && confirmText !== itemToDelete.name}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent ${
                itemToDelete?.type === 'folder' && confirmText !== itemToDelete.name
                  ? 'bg-accent-300 opacity-50 cursor-not-allowed'
                  : 'bg-accent-300 hover:bg-accent-400'
              }`}
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
      
      {/* New Folder Modal */}
      <Modal
        isOpen={showNewFolderModal}
        onClose={() => {
          setShowNewFolderModal(false);
          setNewFolderName('');
        }}
        title="Create New Folder"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="folder-name" className="block text-sm font-medium text-text-primary">
              Folder name:
            </label>
            <input
              type="text"
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="mt-1 p-2 block w-full rounded-md border border-accent bg-sidebar-item text-text-primary focus:outline-none focus:ring-accent focus:border-accent"
              placeholder="New folder"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => {
                setShowNewFolderModal(false);
                setNewFolderName('');
              }}
              className="px-4 py-2 text-sm font-medium text-text-primary bg-primary-200 rounded-md hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent ${
                !newFolderName.trim()
                  ? 'bg-accent-300 opacity-50 cursor-not-allowed'
                  : 'bg-accent-300 hover:bg-accent-400'
              }`}
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
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

// Icon components
function FolderIcon({ expanded = false }) {
  return expanded ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
