/**
 * Global manager for PDF viewer instances to prevent conflicts
 */

// Track all active WebViewer instances
const activeViewers = new Set<string>();

// Track the current active extraction instance
let activeExtractionId: string | null = null;

// Global initialization lock to prevent race conditions
let isInitializing = false;

// Track the last cleanup time to enforce delay between operations
let lastCleanupTime = 0;

// Debug mode
const DEBUG = true;

const debugLog = (...args: any[]) => {
  if (DEBUG) console.log('[PDFViewerManager]', ...args);
};

/**
 * Request permission to initialize a viewer
 * @param id Unique identifier for the viewer
 * @returns Promise that resolves when initialization is allowed
 */
export async function requestInitialization(id: string): Promise<boolean> {
  debugLog(`Initialization requested for ${id}`);
  
  // Special case: if this ID is currently the active extraction, always allow it
  if (activeExtractionId === id) {
    debugLog(`Granting immediate permission to active extraction: ${id}`);
    return true;
  }
  
  // If this viewer is already registered, we need to clean it up first
  if (activeViewers.has(id)) {
    debugLog(`${id} is already registered, unregistering first`);
    unregisterViewer(id);
    // Short delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Wait until any existing initialization is complete
  if (isInitializing) {
    debugLog(`Waiting for initialization lock to clear for ${id}`);
    let attempts = 0;
    const maxAttempts = 20; // 1 second max wait (20 * 50ms)
    
    while (isInitializing && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    
    // If still locked after max attempts, force clear the lock
    if (isInitializing) {
      debugLog(`Force clearing initialization lock after ${attempts} attempts for ${id}`);
      isInitializing = false;
    }
  }
  
  // Set the initialization lock
  isInitializing = true;
  debugLog(`Initialization lock set for ${id}`);
  
  // Ensure minimum time since last cleanup
  const now = Date.now();
  const timeSinceLastCleanup = now - lastCleanupTime;
  if (lastCleanupTime > 0 && timeSinceLastCleanup < 500) {
    const delay = 500 - timeSinceLastCleanup;
    debugLog(`Enforcing cooldown period of ${delay}ms before new initialization`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  debugLog(`Initialization permission granted for viewer: ${id}`);
  return true;
}

/**
 * Release the initialization lock
 */
export function releaseInitializationLock(id?: string): void {
  debugLog(`Releasing initialization lock${id ? ` for ${id}` : ''}`);
  isInitializing = false;
}

/**
 * Register a new viewer instance
 * @param id Unique identifier for the viewer
 * @returns True if registration successful, false if already exists
 */
export function registerViewer(id: string): boolean {
  if (activeViewers.has(id)) {
    debugLog(`PDF Viewer ${id} already registered`);
    return false;
  }
  
  activeViewers.add(id);
  debugLog(`Registered PDF Viewer: ${id} (total: ${activeViewers.size})`);
  return true;
}

/**
 * Unregister a viewer instance
 * @param id Unique identifier for the viewer
 */
export function unregisterViewer(id: string): boolean {
  if (activeViewers.has(id)) {
    activeViewers.delete(id);
    lastCleanupTime = Date.now(); // Record the cleanup time
    debugLog(`Unregistered PDF Viewer: ${id} (remaining: ${activeViewers.size})`);
    return true;
  }
  debugLog(`Attempted to unregister non-existent viewer: ${id}`);
  return false;
}

/**
 * Set the active extraction instance
 * @param id Unique identifier for the extraction instance
 */
export function setActiveExtraction(id: string | null): void {
  if (id === null) {
    if (activeExtractionId) {
      debugLog(`Cleared active PDF extraction: ${activeExtractionId}`);
    }
    activeExtractionId = null;
    return;
  }
  
  activeExtractionId = id;
  debugLog(`Set active PDF extraction: ${id}`);
}

/**
 * Get the active extraction instance ID
 */
export function getActiveExtraction(): string | null {
  return activeExtractionId;
}

/**
 * Check if any viewers are currently active
 */
export function hasActiveViewers(): boolean {
  return activeViewers.size > 0;
}

/**
 * Clear all registered viewers
 * This is useful when showing a new file to ensure no conflicts
 */
export async function clearAllViewers(): Promise<void> {
  const count = activeViewers.size;
  if (count > 0) {
    debugLog(`Clearing all PDF viewers (${count} to remove)`);
    activeViewers.clear();
  }
  
  // Don't clear active extraction ID here - let the component handle that
  
  // Record the cleanup time
  lastCleanupTime = Date.now();
  
  // Force a delay to ensure cleanup completes
  return new Promise<void>(resolve => setTimeout(resolve, 300));
}

export default {
  requestInitialization,
  releaseInitializationLock,
  registerViewer,
  unregisterViewer,
  setActiveExtraction,
  getActiveExtraction,
  hasActiveViewers,
  clearAllViewers
};
