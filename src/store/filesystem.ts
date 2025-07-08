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
  
  // Fetch ALL folders and ALL files for the user
  fetchFolders: async () => {
    try {
      set({ isLoading: true });
      // Get all folders
      const foldersResponse = await fileSystemService.getAllFolders();
      set({ folders: foldersResponse });
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Fetch ALL files for the user
  fetchFiles: async () => {
    try {
      set({ isLoading: true });
      // Get all files
      const filesResponse = await fileSystemService.getAllFiles();
      set({ files: filesResponse });
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
