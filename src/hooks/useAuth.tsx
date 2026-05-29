import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { signInWithGoogle, signOut, subscribeToAuth } from '../lib/firebaseApp';
import { useSettings } from '../store/settingsStore';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: false, signIn: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { firebaseConfig, firebaseEnabled } = useSettings();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!firebaseEnabled);

  useEffect(() => {
    if (!firebaseEnabled || !firebaseConfig) {
      setLoading(false);
      setUser(null);
      return;
    }
    const unsub = subscribeToAuth(firebaseConfig, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, [firebaseEnabled, firebaseConfig]);

  const signIn = async () => {
    if (!firebaseConfig) return;
    setLoading(true);
    try { await signInWithGoogle(firebaseConfig); }
    catch (e) { setLoading(false); throw e; }
  };

  const doSignOut = async () => {
    if (!firebaseConfig) return;
    await signOut(firebaseConfig);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signIn, signOut: doSignOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
