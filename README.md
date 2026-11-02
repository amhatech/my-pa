# My PA

React and Vite personal assistant with Supabase authentication/storage and a Gemini Edge Function.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. In Supabase Project Settings → API, copy the Project URL and publishable/anon key into `.env.local`.
   Never use a service-role or secret key in a browser environment variable.
4. In the Supabase SQL Editor, run `supabase/migrations/20261025000000_user_workspace.sql` and `supabase/migrations/20261028000000_push_notifications.sql`.
5. Set the Edge Function secrets `GEMINI_API_KEY` and `APP_ORIGIN` (your exact deployed site origin, such as `https://example.com`) in Supabase. For account deletion, also set `SUPABASE_SERVICE_ROLE_KEY` as a server-side function secret. Do not add these secrets to `.env.local`.
6. Deploy `supabase/functions/mercy-chat`, `supabase/functions/delete-account`, and `supabase/functions/send-push-notifications`, along with `supabase/config.toml`, using the Supabase CLI or dashboard.
7. In Supabase Authentication settings, enable email sign-up, set the local Site URL to `http://localhost:5173`, and add local and deployed app URLs to the allowed redirect URLs.
8. To enable Google sign-in, create a Google OAuth web client, add Supabase's callback URL shown under the Google provider in the Google OAuth client's authorized redirect URIs, then enable Google under Supabase Authentication → Providers and enter the client ID and secret there. Never put the Google client secret in `.env.local`.
9. Restart Vite with `npm run dev`. When creating an email/password account, choose a unique username in the sign-up form. Google sign-in users choose a username after their first sign-in. New accounts automatically start with an empty cloud workspace.

The app requires the Supabase schema and Edge Function to be deployed before cloud sync and AI chat can work. See Supabase's Edge Function deployment documentation for CLI setup.

## Current capabilities

- Supabase email/password sign-up and sign-in.
- Google sign-in button (requires Google OAuth provider configuration in Supabase).
- Unique per-account usernames collected during email sign-up or after Google sign-in, stored in a row-level-security-protected profile table.
- A per-user workspace row protected by row-level security.
- Browser-local cache with debounced cloud saving and offline indicators.
- New accounts automatically start with an empty cloud workspace.
- AI requests routed through an authenticated Supabase Edge Function; Gemini credentials stay server-side.
- Browser speech-to-text and spoken playback for AI replies where the browser supports them.
- Mercy can automatically save clear user requests as tasks, schedule events, or memories; task priority is saved with each task.
- A three-second hold on Mercy's floating button starts voice typing and sends the recognized request automatically where browser speech recognition is supported.
- A louder, selectable short chime or five-second alarm plays for foreground reminders after the user enables sound; schedule alerts request persistent notifications and vibration where supported.
- Schedule notifications can report an event as overdue after 30 minutes if it remains incomplete.
- Event date/time, configurable reminder lead time, and browser notifications while the app is open and notification permission is granted.
- Background schedule reminders and a different, practical encouragement each day in Mercy's 10:00 AM local Daily Notice use Web Push when VAPID, database, and scheduled Edge Function delivery are configured.
- JSON data export, cloud-record deletion, account deletion (requires its Edge Function and service-role secret), and sign-out controls.
- A production PWA manifest, cached app shell, and service worker registration.

Google sign-in requires OAuth provider configuration before it can be used. Google Calendar OAuth, recurring tasks, full offline conflict resolution, and wake-word voice activation are not implemented. Browser speech recognition and notification support vary by browser and operating system. The browser or operating system controls the sound of notifications delivered while the app is closed; the selected custom sound is played for push notifications while the app is open. Device volume and browser notification settings still affect loudness, and web apps cannot override silent mode or guarantee an alarm while closed.

### Background push setup

Background push is opt-in. The user must sign in, open Settings → Reminders, and allow notifications. Browser permission cannot be granted by the app without that gesture. To deliver notifications while the app is closed:

1. The VAPID public key is bundled in `src/lib/push.js` and is safe to publish. The matching `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and random `PUSH_CRON_SECRET` must only be stored as Supabase Edge Function secrets.
3. Deploy `send-push-notifications` and run the push migration above. Configure Supabase Cron to POST to `https://PROJECT_REF.supabase.co/functions/v1/send-push-notifications` every minute with the header `x-cron-secret` set to the same `PUSH_CRON_SECRET`.
4. Enable and test notifications from a supported browser or installed PWA. iOS requires the app to be installed to the Home Screen for Web Push.

Until the database migration and Cron job are configured, only foreground browser reminders work. Pop-up permission and sound must be enabled by the user in Settings; the app cannot switch on device permissions itself. Background notification audio uses the operating system's notification sound and can be silenced by device settings, Focus modes, or Do Not Disturb. A website cannot play its selected custom alarm while closed or guarantee an alarm will wake someone.

## Security and data

`.env`, `.env.*`, and `.env.local` are ignored by Git; `.env.example` contains placeholders only. The Supabase publishable/anon key is intended for browser use with row-level security. Never expose Supabase service-role keys or the Gemini key to the browser.

Workspace data is stored in Supabase and cached in this browser's local storage. Row-level security restricts each account to its own cloud row. Browser-local data is not end-to-end encrypted and may be lost if site storage is cleared. Export a backup before deleting cloud records.

The current cloud workspace uses a JSON document per user for a simple first migration. A normalized schema is recommended before multi-user scale, complex queries, or concurrent editing.
