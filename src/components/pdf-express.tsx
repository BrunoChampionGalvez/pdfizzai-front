import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';

// Import the client-side component with dynamic loading
const PdfViewerClient = dynamic(
  () => import('./pdf-viewer-client').then(mod => ({ default: mod.PdfViewerClient })),
  { 
    ssr: false, 
    loading: () => (
      <div className="flex justify-center items-center h-full w-full bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    )
  }
);

interface PdfViewerProps {
  pdfUrl: string | null;
  textSnippet?: string;
  paperId?: string | null;
  shouldExtractText?: boolean;
  onTextExtractionComplete?: (success: boolean) => void;
  onTextExtractionProgress?: (progress: number) => void;
}

export const PdfViewer = (props: PdfViewerProps) => {
  const [isClient, setIsClient] = useState(false);
  const [key, setKey] = useState<string>('pdf-viewer-1');
  
  // Set client-side state
  useEffect(() => {
    if (typeof window !== 'undefined' && !isClient) {
      setIsClient(true);
    }
  }, [isClient]);
  
  // Update key when the PDF URL changes to force remount of the component
  useEffect(() => {
    if (props.pdfUrl) {
      // Use just the essential parts to create a stable key
      const urlPart = props.pdfUrl.includes('/') 
        ? props.pdfUrl.substring(props.pdfUrl.lastIndexOf('/') + 1, props.pdfUrl.length)
        : 'file';
      
      // Create a more stable key that won't change unnecessarily
      const uniqueKey = `pdf-viewer-${urlPart}-${props.paperId || 'no-id'}`;
      setKey(uniqueKey);
      
      console.log('Set PDF viewer key:', uniqueKey);
    }
  }, [props.pdfUrl, props.paperId]);

  // Log props for debugging
  useEffect(() => {
    if (props.shouldExtractText) {
      console.log('PdfViewer rendering with extraction enabled:', {
        paperId: props.paperId,
        hasUrl: !!props.pdfUrl,
        hasExtractHandler: !!props.onTextExtractionComplete
      });
    }
  }, [props.shouldExtractText, props.paperId, props.pdfUrl, props.onTextExtractionComplete]);

  // Check if we have a valid PDF URL before rendering
  if (!props.pdfUrl) {
    return (
      <div className="flex justify-center items-center h-full w-full bg-gray-100">
        <div className="text-center text-red-500 p-4">
          <p>Missing PDF URL</p>
        </div>
      </div>
    );
  }

  // Return the dynamically loaded client component with a key to force remounting
  return <PdfViewerClient key={key} {...props} />;
};