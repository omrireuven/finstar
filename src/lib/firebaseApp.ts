/**
 * Lazy Firebase initialisation — only runs if user has saved a config.
 * We re-initialise whenever the config changes.
 */
import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import type { FirebaseConfig } from '../store/settingsStore';

let app: FirebaseApp | null = null;

function ensureApp(config: FirebaseConfig): FirebaseApp {
  // If already initialised with same config, reuse
  const existing = getApps();
  if (existing.length > 0 && app) return app;

  // Tear down previous app
  if (existing.length > 0) existing.forEach((a) => deleteApp(a));

  app = initializeApp(config);
  return app;
}

export function signInWithGoogle(config: FirebaseConfig): Promise<User> {
  const fbApp = ensureApp(config);
  const auth = getAuth(fbApp);
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider).then((r) => r.user);
}

export function signOut(config: FirebaseConfig): Promise<void> {
  const fbApp = ensureApp(config);
  return fbSignOut(getAuth(fbApp));
}

export function subscribeToAuth(
  config: FirebaseConfig,
  callback: (user: User | null) => void
): () => void {
  const fbApp = ensureApp(config);
  return onAuthStateChanged(getAuth(fbApp), callback);
}
