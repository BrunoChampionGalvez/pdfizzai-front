'use client';

import { ToastProvider } from '../../components/ToastProvider';

interface SubscriptionClientLayoutProps {
  children: React.ReactNode;
}

export default function SubscriptionClientLayout({
  children,
}: SubscriptionClientLayoutProps) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
