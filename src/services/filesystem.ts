import api from '../lib/api';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface File {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  folder_id: string | null;
  upload_date: string;
}

export const fileSystemService = {
  async getFolders(parentId?: string): Promise<{ folders: Folder[]; files: File[] }> {
    const params = parentId ? { parentId } : {};
    const response = await api.get('/api/folders', { params });
    return response.data;
  },

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    const response = await api.post('/api/folders', { name, parentId });
    return response.data;
  },

  async deleteFolder(folderId: string): Promise<void> {
    await api.delete(`/api/folders/${folderId}`);
  },

  async uploadFile(file: File, folderId?: string): Promise<File> {
    const formData = new FormData();
    formData.append('file', file as any);
    if (folderId) {
      formData.append('folderId', folderId);
    }

    const response = await api.post('/api/files', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async deleteFile(fileId: string): Promise<void> {
    await api.delete(`/api/files/${fileId}`);
  },

  getFileDownloadUrl(fileId: string): string {
    return `${api.defaults.baseURL}/api/files/${fileId}/download`;
  },
};
