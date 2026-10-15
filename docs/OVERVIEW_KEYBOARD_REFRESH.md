# Provider overview and composer

Provider overview follows the supplied light/dark emerald design: prominent
provider avatar/name/badge, four real account metrics, driver availability card,
location privacy note, guidance and icon navigation. Profile media and account
controls remain in Settings. Free-plan guidance does not claim a paid subscription.
Driver availability still uses explicit opt-in and the existing two-minute lease.

The shared keyboard handler no longer calls scrollIntoView(center) for inputs
inside full-screen community/legacy chats. The visual viewport height and offset
anchor the chat to the keyboard; scrolling updates only the viewport offset and
does not reveal/recentre a field. Ordinary long forms retain field reveal.

Provider shell v16 includes provider-overview.css, also copied into the separate
provider Docker image. Deploy the provider application separately from admin;
installed PWA users choose Refresh app. theme.js is shared, so deploy admin too.
No migration, worker, credentials or permission change is needed for this UI.

Node tests cover viewport offset/resizing without chat recentering and preserve
normal-form reveal. Chrome tests cover four viewport widths, both overview themes,
no horizontal overflow, preserved controls, private cache/Settings and reduced-height
composers. Captured local previews are under .tmp/overview-review (workspace root).
Actual Android/iOS keyboards still need phone acceptance testing.
