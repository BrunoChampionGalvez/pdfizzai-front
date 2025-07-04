'use client';

import { useEffect, useState } from 'react';
import { useFileSystemStore } from '../../store/filesystem';
import { useChatStore } from '../../store/chat';
import { fileSystemService } from '../../services/filesystem';
import { chatService } from '../../services/chat';
import ChatPane from '../../components/ChatPane';
import PDFViewer from '../../components/PDFViewer';

export default function AppPage() {
  const { currentFolderId, folders, files, setFolders, setFiles, setLoading: setFSLoading } = useFileSystemStore();
  const { 
    currentSessionId, 
    currentReference, 
    isChatPaneCollapsed,
    setSessions, 
    setLoading: setChatLoading 
  } = useChatStore();
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Load initial folders and files
  useEffect(() => {
    const loadFolderContents = async () => {
      try {
        setFSLoading(true);
        const { folders, files } = await fileSystemService.getFolders(currentFolderId || undefined);
        setFolders(folders);
        setFiles(files);
      } catch (error) {
        console.error('Failed to load folders', error);
      } finally {
        setFSLoading(false);
        setIsInitialLoading(false);
      }
    };

    loadFolderContents();
  }, [currentFolderId, setFolders, setFiles, setFSLoading]);

  // Load chat sessions
  useEffect(() => {
    const loadChatSessions = async () => {
      try {
        setChatLoading(true);
        const sessions = await chatService.getUserSessions();
        setSessions(sessions);
      } catch (error) {
        console.error('Failed to load chat sessions', error);
      } finally {
        setChatLoading(false);
      }
    };

    loadChatSessions();
  }, [setSessions, setChatLoading]);

  // When no files are selected or referenced, show welcome screen
  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center">
        <div className="animate-pulse text-accent text-2xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`flex h-full ${currentReference ? 'flex-col md:flex-row' : ''}`}>
        <ChatPane />
        {currentReference && <PDFViewer />}
      </div>
    </div>
  );
}
