import type { Metadata } from "next";
import "./globals.css";
import { PDFViewerProvider } from "../contexts/PDFViewerContext";
import AuthGuard from "../components/AuthGuard";

export const metadata: Metadata = {
  title: "PDFizz AI - AI-Powered PDF Chat",
  description: "Upload PDFs and chat with AI about their contents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-screen bg-primary text-text-primary">
        <PDFViewerProvider>
          <AuthGuard>{children}</AuthGuard>
        </PDFViewerProvider>
      </body>
    </html>
  );
}
