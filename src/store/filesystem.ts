import { create } from 'zustand';
import { Folder, File, fileSystemService } from '../services/filesystem';

interface FileSystemState {
  folders: Folder[];
  files: File[];
  currentFolderId: string | null;
  isLoading: boolean;
  
  setFolders: (folders: Folder[]) => void;
  setFiles: (files: File[]) => void;
  setCurrentFolderId: (folderId: string | null) => void;
  setLoading: (loading: boolean) => void;
  addFolder: (folder: Folder) => void;
  removeFolder: (folderId: string) => void;
  addFile: (file: File) => void;
  removeFile: (fileId: string) => void;
  
  fetchFolders: () => Promise<void>;
  fetchFiles: () => Promise<void>;
}

export const useFileSystemStore = create<FileSystemState>((set, get) => ({
  folders: [],
  files: [],
  currentFolderId: null,
  isLoading: false,
  
  setFolders: (folders) => set({ folders }),
  setFiles: (files) => set({ files }),
  setCurrentFolderId: (currentFolderId) => set({ currentFolderId }),
  setLoading: (isLoading) => set({ isLoading }),
  
  addFolder: (folder) => set((state) => ({ 
    folders: [...state.folders, folder] 
  })),
  
  removeFolder: (folderId) => set((state) => ({ 
    folders: state.folders.filter(folder => folder.id !== folderId) 
  })),
  
  addFile: (file) => set((state) => ({ 
    files: [...state.files, file] 
  })),
  
  removeFile: (fileId) => set((state) => ({ 
    files: state.files.filter(file => file.id !== fileId) 
  })),
  
  // Fix: Extract folders from the response
  fetchFolders: async () => {
    try {
      set({ isLoading: true });
      const response = await fileSystemService.getFolders();
      set({ folders: response.folders }); // Extract folders from the response
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Fix: Use getFolders to get files as well since getFiles doesn't exist
  fetchFiles: async () => {
    try {
      set({ isLoading: true });
      const response = await fileSystemService.getFolders(); // getFolders returns both folders and files
      set({ files: response.files }); // Extract files from the response
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
