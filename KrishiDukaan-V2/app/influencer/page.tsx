import { redirect } from 'next/navigation';

// Land influencers on the dashboard; its subscription gate redirects the
// unsubscribed to the paywall and leaves the (free) profile reachable.
export default function InfluencerIndexPage() {
  redirect('/influencer/dashboard');
}
