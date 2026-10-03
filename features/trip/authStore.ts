import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  /** True once the stored session has been read. */
  ready: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: null, ready: false }));

/** Keep useAuth in sync with Supabase. Mount once, in the root layout. */
export function useAuthListener() {
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => useAuth.setState({ session: data.session, ready: true }))
      .catch(() => useAuth.setState({ ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useAuth.setState({ session, ready: true });
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

export function displayNameOf(session: Session | null): string {
  const name = session?.user.user_metadata?.display_name;
  return typeof name === 'string' ? name : '';
}

export const useUserId = () => useAuth((s) => s.session?.user.id ?? null);
export const useDisplayName = () => useAuth((s) => displayNameOf(s.session));
