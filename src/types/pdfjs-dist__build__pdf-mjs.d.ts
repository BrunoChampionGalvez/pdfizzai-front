declare module 'pdfjs-dist/build/pdf.mjs' {
  export class TextLayer {
    constructor(options: unknown);
    render(): Promise<void>;
    cancel(): void;
  }

  // The viewport type from pdfjs-dist isn't exported from this path; use unknown to avoid type conflicts
  export function setLayerDimensions(div: HTMLElement, viewport: unknown): void;
}