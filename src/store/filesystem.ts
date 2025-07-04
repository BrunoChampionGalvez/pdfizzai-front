import { create } from 'zustand';

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface File {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  folder_id: string | null;
  upload_date: string;
}

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
  addFile: (file: File) => void;
  removeFolder: (folderId: string) => void;
  removeFile: (fileId: string) => void;
}

export const useFileSystemStore = create<FileSystemState>((set) => ({
  folders: [],
  files: [],
  currentFolderId: null,
  isLoading: false,
  setFolders: (folders) => set({ folders }),
  setFiles: (files) => set({ files }),
  setCurrentFolderId: (currentFolderId) => set({ currentFolderId }),
  setLoading: (isLoading) => set({ isLoading }),
  addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
  addFile: (file) => set((state) => ({ files: [...state.files, file] })),
  removeFolder: (folderId) => set((state) => ({ folders: state.folders.filter(f => f.id !== folderId) })),
  removeFile: (fileId) => set((state) => ({ files: state.files.filter(f => f.id !== fileId) })),
}));
