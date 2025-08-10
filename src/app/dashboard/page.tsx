'use client';

import { useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import ChatPane from '../../components/ChatPane';
import PDFViewer from '../../components/PDFContainer';
import { useFileSystemStore } from '../../store/filesystem';

export default function Dashboard() {
  const { fetchFolders, fetchFiles } = useFileSystemStore();
  
  // Fetch folders and files on page load
  useEffect(() => {
    fetchFolders();
    fetchFiles();
  }, [fetchFolders, fetchFiles]);

  return (
    <div className="h-screen flex flex-col bg-background-primary text-text-primary">
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <PDFViewer />
          <ChatPane />
        </div>
      </div>
    </div>
  );
}
