import type { Metadata } from 'next';
import SubscriptionClientLayout from './SubscriptionClientLayout';

export const metadata: Metadata = {
  title: 'Subscription - PDFizz AI',
  description: 'Manage your PDFizz AI subscription and billing',
};

export default function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionClientLayout>
      {children}
    </SubscriptionClientLayout>
  );
}
