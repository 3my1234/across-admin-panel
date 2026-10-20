# Provider installation and update prompts — 20 October 2026

The signed-out provider page now offers installation before login or onboarding.
The action invokes the browser's install prompt when available; otherwise it
opens centred instructions for Android, iPhone or desktop. Browser policy still
controls whether a native install prompt is available. Installation is optional;
the same page remains usable in a browser. Installed standalone and embedded
native views hide the installation offer.

Available updates now open an accessible centred dialog with Update now and
Later. No automatic page reload occurs. Later/Escape keeps current work, and the
same waiting worker is not repeatedly announced during periodic checks. Choosing
Update now activates the waiting worker and reloads once after activation. A
15-second stalled activation restores the retry action rather than leaving it
disabled indefinitely. Initial service-worker installation is not an app update.

The install action remains available in Settings. Script/style query versions
and service-worker cache generation are advanced. The separate provider Docker
image includes the new install module. No native APK/IPA rebuild or backend
runtime change is required for these provider-web changes.

## Verification

- Node install tests: unauthenticated entry, manual instructions, single-use
  install event, dismiss/install state, standalone/embedded and iPhone paths.
- Node update tests: modal, Later/Escape, no automatic reload, one reload after
  approval, other-tab update handling and first-install behavior.
- Existing push recovery and private PWA caching/deep-link tests.
- Chrome phone-viewport test: visible signed-out offer; browser install event;
  centred, viewport-fitting install/update dialogs; Later preserves entered input.
- Existing full provider/admin browser and Docker checks in CI.

## Deploy and device acceptance

Redeploy **atlxpres-provider**, which serves https://provider.atlxpres.com. Visit
that exact address in Chrome or Samsung Internet while signed out. Confirm the
Install app offer is visible without creating an account. Install and reopen from
the home screen; the offer should disappear. Open an already installed copy after
deployment and confirm the centred update prompt; Later must preserve unsent
work, while Update now refreshes once. Previously loaded older scripts may need
their existing Refresh app action or a normal reopen before this prompt appears.

Phone notification display still needs a device test with the PWA backgrounded
and locked. Enabled app/OS settings alone do not establish active browser push
registration or prove delivery. These UI changes do not claim that incident's
root cause is resolved.
