'use client';

import { useState, useEffect, useRef } from 'react';
import { useFileSystemStore } from '../store/filesystem';
import { fileSystemService, Folder } from '../services/filesystem';
import FileList from './FileList';
import Modal from './Modal';
import FileUploader from './FileUploader';

export default function FolderTree() {
  const { folders, files, currentFolderId, setCurrentFolderId, isLoading, addFolder, removeFolder, removeFile, addFile } = useFileSystemStore();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [draggedItem, setDraggedItem] = useState<{ type: 'folder' | 'file', id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'folder' | 'file', id: string, name: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  // Expand the current folder and its parents
  useEffect(() => {
    if (currentFolderId) {
      let folder = folders.find(f => f.id === currentFolderId);
      if (folder) {
        const newExpandedFolders = { ...expandedFolders };
        newExpandedFolders[currentFolderId] = true;
        
        // Expand all parent folders
        while (folder && folder.parent_id) {
          newExpandedFolders[folder.parent_id] = true;
          folder = folders.find(f => f.id === folder?.parent_id);
        }
        
        setExpandedFolders(newExpandedFolders);
      }
    }
  }, [currentFolderId, folders]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleFolderClick = (folderId: string) => {
    setCurrentFolderId(folderId);
    toggleFolder(folderId);
  };

  const handleRootClick = () => {
    setCurrentFolderId(null);
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
  
  // Drag and drop handlers
  const handleDragStart = (type: 'folder' | 'file', id: string, e: React.DragEvent) => {
    setDraggedItem({ type, id });
    
    // Set the drag image and effect
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      
      // Create a custom ghost image
      const ghostElement = document.createElement('div');
      ghostElement.textContent = type === 'folder' ? 
        folders.find(f => f.id === id)?.name || 'Folder' : 
        files.find(f => f.id === id)?.filename || 'File';
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
    setDraggedItem(null)
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

  // Get root level folders
  const rootFolders = folders.filter(folder => folder.parent_id === null);
  
  // Get files at current level
  const currentFiles = files.filter(file => file.folder_id === currentFolderId);

  // Recursive function to render folder tree
  const renderFolder = (folder: Folder, depth: number = 0) => {
    const isExpanded = expandedFolders[folder.id] || false;
    const isActive = currentFolderId === folder.id;
    const childFolders = folders.filter(f => f.parent_id === folder.id);
    const hasChildren = childFolders.length > 0;
    const isDropTarget = dropTarget === folder.id;
    const isDragging = draggedItem?.type === 'folder' && draggedItem.id === folder.id;
    
    return (
      <div key={folder.id} className="mb-1">
        <div 
          className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer group ${
            isActive ? 'bg-accent/20 text-accent border-l-2 border-accent' : 
            isDropTarget ? 'bg-background-primary/30' : 
            isDragging ? 'opacity-50' : 'hover:bg-accent/10'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => handleFolderClick(folder.id)}
          draggable
          onDragStart={(e) => handleDragStart('folder', folder.id, e)}
          onDragOver={(e) => handleDragOver(folder.id, e)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(folder.id, e)}
        >
          <FolderIcon expanded={isExpanded} />
          <span className="ml-2 text-sm truncate flex-grow text-text-primary">{folder.name}</span>
          
          <div className="flex space-x-1 ml-2 opacity-0 group-hover:opacity-100">
            {/* New folder button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                openNewFolderModal(folder.id);
              }}
              className="text-text-primary hover:text-accent transition-colors focus:outline-none cursor-pointer"
              title="New folder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
            
            {/* Upload file button */}
            <FileUploader
              folderId={folder.id}
              isIcon={true}
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
        
        {isExpanded && hasChildren && (
          <div className="mt-1">
            {childFolders.map(childFolder => renderFolder(childFolder, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="p-4 text-text-secondary text-sm">Loading...</div>;
  }

  return (
    <div>
      <div 
        className={`flex items-center py-1 px-2 rounded-md cursor-pointer mb-2 hover:bg-accent/10 ${
          dropTarget === null ? 'bg-background-primary/30' : 'bg-background-secondary'
        }`}
        onClick={handleRootClick}
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
              openNewFolderModal(null);
            }}
            className="hover:text-accent text-white transition-colors focus:outline-none cursor-pointer"
            title="New folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </button>
          
          {/* Upload file button for root level */}
          <FileUploader
            folderId={null}
            isIcon={true}
          />
        </div>
      </div>
      <div className='rounded-lg p-2 mb-4 bg-background-secondary/30'>
        <h3 className="text-xs uppercase tracking-wider text-text-secondary mb-2 px-2">Folders</h3>
        {rootFolders.map(folder => renderFolder(folder))}
      </div>
      
      {/* Show files for current folder level */}
      <FileList files={currentFiles} />
      
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
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
