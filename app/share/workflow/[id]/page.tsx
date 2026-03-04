import { Metadata } from 'next';
import SharedWorkflowClient from './client';

export const metadata: Metadata = {
  title: 'Shared Workflow - SanHub',
  description: 'View and import a shared workflow',
};

export default function SharedWorkflowPage({ params }: { params: { id: string } }) {
  return <SharedWorkflowClient shareId={params.id} />;
}
