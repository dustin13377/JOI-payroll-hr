// Captures window.location.hash at module-import time.
//
// Why: the Supabase JS client's `detectSessionInUrl: true` (default) parses and
// CLEARS the URL hash on init — async, but typically before our React components
// mount. That means by the time ResetPassword.tsx reads `window.location.hash`,
// it's empty. We can't tell invite vs recovery vs nothing.
//
// Fix: import this module FIRST in main.tsx, before App (and therefore before
// the Supabase client module). ES modules execute top-to-bottom in import order,
// so this runs while the hash is still intact.
//
// Use `initialAuthHash` in components that need to know the auth flow type
// (e.g. ResetPassword detecting type=invite vs type=recovery).
export const initialAuthHash: string =
  typeof window !== "undefined" ? window.location.hash : "";
