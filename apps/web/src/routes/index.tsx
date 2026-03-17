import { createFileRoute } from '@tanstack/react-router';
import { RiderListPage } from '@/features/rider-list/components/rider-list-page';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return <RiderListPage />;
}
