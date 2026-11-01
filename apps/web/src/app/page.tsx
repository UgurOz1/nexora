import { HomeRedirect } from '@/components/home-redirect';

// "/" has nothing of its own: it sends people where they belong once we know who they are.
export default function HomePage() {
  return <HomeRedirect />;
}
