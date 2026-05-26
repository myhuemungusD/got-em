export interface FirebaseEnv {
  apiKey: string | undefined;
  authDomain: string | undefined;
  projectId: string | undefined;
  appId: string | undefined;
  messagingSenderId: string | undefined;
  storageBucket: string | undefined;
}

export const env: FirebaseEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

export const TEST_MODE: boolean =
  import.meta.env.MODE !== "production" || !env.apiKey;
