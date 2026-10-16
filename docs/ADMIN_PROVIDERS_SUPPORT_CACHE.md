# Admin Providers design and provider Support cache

Admin Providers follows the supplied green light/dark layout: icon sidebar,
section cards, contained tables, verification/status pills, subscription dots,
compact moderation actions and live plan controls. Actual plan names, prices,
capacities, document review, before/after listing edits, confirmations and role
controls remain; illustration values are not copied into production policy.
Count/loading feedback is distinct from errors. Tables scroll inside panels on
small screens. admin-providers.css loads only in admin and styles Providers mode.

Provider Support now uses the existing encrypted IndexedDB PrivateChatStore for
its latest ticket/message pages, plus its process-memory cache. Disk and network
reads run concurrently and stale disk cannot overwrite a successful network
response. Actor/thread generation checks and explicit sign-out clearing prevent
old-account hydration/writes, even when general Chats was never opened. The
native provider workspace delegates these same Support keys to its existing
encrypted native cache (requires updated mobile binary).

Snapshots retain valid page cursors; live pages refresh hydrated cursors. Hydration
itself does not mark messages read. Existing seven-day TTL/size bounds, private
API no-cache policy and server authority remain. This is a local fast-open cache,
not cloud backup, end-to-end encryption or an offline send queue. Browser storage
may be cleared, and first visits still need the network.

Deploy admin and separate provider resources; installed provider PWA Refresh app
to shell v18. No new migration, API/worker changes or infrastructure scaling was
configured. Tests cover actual Support loaders with slow disk/network, current
cursors, account isolation, encrypted store restart/logout, admin both-theme
responsive layout and billing role gates. Real phone acceptance remains required.
