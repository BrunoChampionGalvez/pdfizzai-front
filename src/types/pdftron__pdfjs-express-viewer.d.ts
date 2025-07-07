declare module '@pdftron/pdfjs-express-viewer' {
  interface WebViewerOptions {
    path: string;
    initialDoc?: string;
    licenseKey?: string;
    // Add other configuration options as needed
    [key: string]: any;
  }

  interface WebViewerInstance {
    UI: any;
    Core: any;
    // Add other properties as needed
  }

  export default function WebViewer(
    options: WebViewerOptions, 
    element: HTMLElement
  ): Promise<WebViewerInstance>;
}
