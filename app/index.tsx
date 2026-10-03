import { Redirect } from 'expo-router';

import { useAuth } from '@/features/trip/authStore';

export default function Index() {
  const signedIn = useAuth((s) => !!s.session);
  return <Redirect href={signedIn ? '/home' : '/intro'} />;
}
