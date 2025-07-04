import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Refery AI - AI-Powered PDF Chat",
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
        {children}
      </body>
    </html>
  );
}
