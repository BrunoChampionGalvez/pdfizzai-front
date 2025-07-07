import { create } from 'zustand';

interface UIState {
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>((set) => {
  // Initialize from localStorage if available
  const storedSidebarState = typeof window !== 'undefined' 
    ? localStorage.getItem('sidebarCollapsed') === 'true'
    : false;

  return {
    isSidebarCollapsed: storedSidebarState,
    setSidebarCollapsed: (collapsed) => {
      // Update localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebarCollapsed', String(collapsed));
      }
      set({ isSidebarCollapsed: collapsed });
    }
  };
});
