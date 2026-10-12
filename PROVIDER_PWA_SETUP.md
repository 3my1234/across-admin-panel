# Provider app setup

## Separate provider deployment

Use the same repository, but a new Coolify application with Dockerfile build
pack, base directory /, Dockerfile Location /Dockerfile.provider, port 8080 and
HTTPS domain https://provider.atlxpres.com. Its image contains only provider
assets, not the admin HTML/script. Keep the existing admin resource/domain.
Ensure backend ALLOWED_ORIGINS includes this provider origin and
PROVIDER_PORTAL_URL=https://provider.atlxpres.com on API + worker. Do not remove
the origins used by the existing admin and website. Redeploy after changing
environment settings. Copying the same code into another repository is not
required: deployment, login, navigation and cached app assets are separate.

## Browser phone notifications

These are separate from Expo/FCM credentials. Keep the working mobile push
configuration unchanged.

1. Deploy the new backend image and migrations 072–074 first (see backend
   docs/CHAT_LAUNCH_CAPACITY.md). In the API's Coolify Terminal run once:

       /app/across-webpush-keys

2. It prints WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY. Copy both
   to environment variables in BOTH the API and worker resources. Keep the
   private key secret; do not paste it into chat, Git, EXPO_PUBLIC_* or portal
   files. Keep this pair stable so existing installations stay subscribed.
3. Set WEB_PUSH_SUBJECT=mailto:support@atlxpres.com on both resources. Redeploy
   API and worker. The dedicated worker must use /Dockerfile.worker.
4. Deploy provider portal, open it over HTTPS, sign in, select Install app on
   Android or Share → Add to Home Screen on iPhone. Then open the installed
   app, select Enable phone notifications, and allow the permission.
5. Close/background the app. Send a real customer message and an admin support
   reply. Verify the phone notification and tap it to return to the app. Test
   Android and iPhone separately. A real phone delivery check is still required.

The app provides standalone display, mobile navigation, safe-area spacing,
keyboard-aware chat and an in-app photo viewer with pinch/pan/zoom. Offline mode
shows a reconnect page; chat history is not persisted in the service-worker
cache, and sending requires a connection. iPhone Web Push requires a Home Screen
web app on iOS 16.4+ and a user-initiated permission request. OS notification
permissions, Focus/silent settings and browser policies control alert display
and sound; a PWA cannot override them.

## Diagnosis without private message content

Worker logs show browser push delivery counts/errors. In psql connected to the
application database, inspect only status (not subscription endpoints/keys):

    SELECT status,count(*),max(attempts) FROM web_push_deliveries GROUP BY status;
    SELECT status,attempts,last_error,created_at,sent_at FROM web_push_deliveries ORDER BY created_at DESC LIMIT 20;

HTTP 404/410 disables an expired browser subscription; reopening/enabling the
app registers a fresh one. Network/429/5xx failures retry up to six attempts;
jobs older than 24 hours expire. Repeated HTTP 401/403 requires checking the
matching VAPID pair/subject. Keys are validated as a matching pair. Admin ops
queue-health also shows the active browser-push backlog. Browser-push delivery
is at-least-once: a process stopping after delivery but before saving status may
retry; stable notification tags reduce duplicate visible alerts.

Sources: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
