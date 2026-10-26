# My PA

React and Vite personal assistant with Supabase authentication/storage and a Gemini Edge Function.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. In Supabase Project Settings → API, copy the Project URL and publishable/anon key into `.env.local`.
   Never use a service-role or secret key in a browser environment variable.
4. In the Supabase SQL Editor, run `supabase/migrations/20261025000000_user_workspace.sql`.
5. Set the Edge Function secrets `GEMINI_API_KEY` and `APP_ORIGIN` (your exact deployed site origin, such as `https://example.com`) in Supabase. For account deletion, also set `SUPABASE_SERVICE_ROLE_KEY` as a server-side function secret. Do not add these secrets to `.env.local`.
6. Deploy `supabase/functions/mercy-chat` and `supabase/functions/delete-account`, along with `supabase/config.toml`, using the Supabase CLI or dashboard.
7. In Supabase Authentication settings, enable email sign-up, set the local Site URL to `http://localhost:5173`, and add local and deployed app URLs to the allowed redirect URLs.
8. To enable Google sign-in, create a Google OAuth web client, add Supabase's callback URL shown under the Google provider in the Google OAuth client's authorized redirect URIs, then enable Google under Supabase Authentication → Providers and enter the client ID and secret there. Never put the Google client secret in `.env.local`.
9. Restart Vite with `npm run dev`, create/sign in to an account, choose a unique username, then choose whether to import this browser's existing data or start empty.

The app requires the Supabase schema and Edge Function to be deployed before cloud sync and AI chat can work. See Supabase's Edge Function deployment documentation for CLI setup.

## Current capabilities

- Supabase email/password sign-up and sign-in.
- Google sign-in button (requires Google OAuth provider configuration in Supabase).
- Unique per-account usernames stored in a row-level-security-protected profile table.
- A per-user workspace row protected by row-level security.
- Browser-local cache with debounced cloud saving and offline indicators.
- A one-time choice to import the current browser's records into a new cloud workspace.
- AI requests routed through an authenticated Supabase Edge Function; Gemini credentials stay server-side.
- Browser speech-to-text and spoken playback for AI replies where the browser supports them.
- Event date/time, configurable reminder lead time, and browser notifications while the app is open and notification permission is granted.
- JSON data export, cloud-record deletion, account deletion (requires its Edge Function and service-role secret), and sign-out controls.
- A production PWA manifest, cached app shell, and service worker registration.

Google sign-in requires OAuth provider configuration before it can be used. Google Calendar OAuth, notifications while the browser/app is closed, AI record-editing actions, recurring tasks, full offline conflict resolution, and wake-word voice activation are not implemented. Browser speech recognition and notification support vary by browser and operating system; browser reminders are best-effort and require the app to remain open.

## Security and data

`.env`, `.env.*`, and `.env.local` are ignored by Git; `.env.example` contains placeholders only. The Supabase publishable/anon key is intended for browser use with row-level security. Never expose Supabase service-role keys or the Gemini key to the browser.

Workspace data is stored in Supabase and cached in this browser's local storage. Row-level security restricts each account to its own cloud row. Browser-local data is not end-to-end encrypted and may be lost if site storage is cleared. Export a backup before deleting cloud records.

The current cloud workspace uses a JSON document per user for a simple first migration. A normalized schema is recommended before multi-user scale, complex queries, or concurrent editing.
