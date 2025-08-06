declare module '@pdftron/pdfjs-express-viewer' {
  interface WebViewerOptions {
    path: string;
    initialDoc?: string;
    licenseKey?: string;
    extension?: string;
    disabledElements?: string[];
    enableFilePicker?: boolean;
    // Add other configuration options as needed
    [key: string]: unknown;
  }

  interface DocumentViewer {
    addEventListener: (event: string, callback: (data?: unknown) => void) => void;
    removeEventListener: (event: string, callback: (data?: unknown) => void) => void;
    getPageCount: () => number;
    getDocument: () => {
      getPageText: (pageNumber: number) => Promise<string>;
    };
  }

  interface FitMode {
    FitWidth: string;
    FitHeight: string;
    FitPage: string;
  }

  interface UI {
    dispose: () => void;
    setFitMode: (mode: string) => void;
    searchText: (text: string) => void;
    FitMode: FitMode;
    [key: string]: unknown;
  }

  interface Core {
    documentViewer: DocumentViewer;
    [key: string]: unknown;
  }

  interface WebViewerInstance {
    UI: UI;
    Core: Core;
    // Add other properties as needed
  }

  export default function WebViewer(
    options: WebViewerOptions, 
    element: HTMLElement
  ): Promise<WebViewerInstance>;
}
