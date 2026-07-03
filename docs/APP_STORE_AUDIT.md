# Got Em — App Store Quality Audit & Eligibility Report

_Audited 2026-07-03 on `main` @ `78f1962`. Quality gate at audit time: typecheck ✓,
lint ✓, 440/440 tests ✓, production build ✓ (124 kB gzipped)._

---

## Executive summary

**Yes — this game can be made store-eligible, on both stores, without a Mac.**

- **Google Play (via the existing TWA scaffold): ~95% ready.** Two concrete
  items block submission: a real `/.well-known/assetlinks.json` (needs the
  Play App Signing certificate fingerprint) and a committed Bubblewrap
  `twa-manifest.json` with a versionCode strategy. Cost: **$25 one-time**.
  Personal accounts must also pass Google's **12-tester / 14-day closed-test
  gate** before production — budget 3–4 weeks.
- **Apple App Store: possible with $99/yr and zero Mac.** Apple Developer
  enrollment is fully web-based. PWABuilder generates the iOS (Swift/WKWebView)
  project; **Codemagic's free tier (500 macOS build min/month)** signs and
  uploads to App Store Connect using an API key — no Xcode, no Mac. The real
  risk is **Guideline 4.2 (minimum functionality)** rejection for web wrappers;
  mitigations below.
- **Content rating:** virtual-chip dice wagering **must be declared as
  simulated gambling** on both stores. Expect **ESRB Teen / PEGI 18** on Play
  and **18+** on Apple (their 2025 rating system has no middle tier for
  frequent simulated gambling). This is a label, not a block — free
  social-casino games are fully allowed.

The codebase itself is strong: transactional game core, hardened Firestore
rules with a rules-test harness, 440 tests, complete PWA manifest with
designed icons/screenshots, privacy policy, and in-app gambling disclaimers.
What stood between it and 5-star *reviews* was a small cluster of
mobile-Safari viewport bugs and silent-failure paths — the top items were
fixed on this branch (see "Fixed in this audit" below).

---

## Fixed in this audit (this branch)

| Severity | Fix | Files |
|---|---|---|
| Blocker | `100vh` was overriding `100dvh` (declaration order), sizing the app to the large viewport on iOS Safari — the Roll button could sit behind the browser toolbar | `src/styles/tokens.css` |
| Blocker | Splash and gameover screens were center-justified with overflow hidden — on short viewports (iPhone SE, landscape) both ends clipped with no way to scroll. Now: centered when content fits, scrollable when it doesn't | `src/styles/splash.css`, `src/styles/gameover.css` |
| Blocker | Firestore snapshot listener had no error observer — an errored listener dies **permanently and silently** (game freezes, opponent "never rolls"). Now surfaces a recoverable error screen | `src/firebase/real.ts`, `src/firebase/ops.ts`, `src/game-bridge.ts` |
| Major | "Create Game" failure showed nothing (button just un-disabled). Now shows a human-readable error inline | `src/screens/mode-select.ts`, `src/styles/mode-select.css` |
| Major | Raw error codes leaked to users: `TOO_FEW_PLAYERS` had no mapping, Firestore SDK sentences ("client is offline") shown verbatim. Added mappings + safe fallbacks | `src/utils/human-error.ts` |
| Major | Offline: invite deep-links (`/?room=ABCD`) missed every cache fallback (query-string mismatch), and nothing was precached so first-launch-offline dead-ended. Now `ignoreSearch` matching + app-shell precache | `public/sw.js` |
| Minor | `apple-touch-icon` was 192×192; regenerated at the proper 180×180 and declared `sizes` | `public/icons/apple-touch-icon.png`, `index.html` |
| Polish | OG/Twitter card pointed a square icon at a `summary_large_image` card — now uses the 1024×500 feature graphic. Added `<noscript>` fallback. Host name trimmed before room creation | `index.html`, `src/screens/mode-select.ts` |

---

## Path to Google Play (do these in order)

1. **Decide the forever domain.** The TWA's package identity is
   cryptographically bound to its origin. `got-em.vercel.app` works, but
   moving domains later means an app update + new assetlinks. The host is
   hardcoded in 8+ places (`index.html`, `robots.txt`, `sitemap.xml`,
   `twa/twa-values.json`, setup scripts) — decide before minting the AAB.
2. **Create a Play Console account** ($25 one-time). An *organization*
   account skips the 12-tester requirement; a personal account must run a
   closed test with **≥12 opted-in testers for 14 continuous days** before
   production access.
3. **Generate the Android project** with Bubblewrap using
   `twa/twa-values.json`, and **commit the resulting `twa-manifest.json`**
   (it carries `appVersionCode` — every update must increment it).
4. **Enroll in Play App Signing**, then take the **Play-managed signing key's
   SHA-256** from Play Console → App integrity (NOT just the local upload
   key) and write **both** fingerprints into
   `public/.well-known/assetlinks.json` (from the existing template). Without
   this the "app" shows a browser URL bar — an instant quality flag.
5. **IARC content questionnaire: declare simulated gambling honestly.**
   Expect ESRB Teen / PEGI 18. Set target audience 13+ (18+ is safer).
   Answering "no gambling themes" risks a forced re-rating or takedown later.
   The in-app "Simulated dice — no real-money wagering" disclaimers and the
   privacy policy already say the right things.
6. **Data safety form:** anonymous auth UID + session game data, no ads, no
   tracking — matches `public/privacy.html` as written.
7. Store listing assets are **already done**: 512 icon, 1024×500 feature
   graphic, four 1080×1920 screenshots.

## Path to Apple App Store (no Mac required)

1. **Enroll in the Apple Developer Program** ($99/yr) — entirely in the
   browser at developer.apple.com. All of App Store Connect (app record,
   metadata, screenshots, review) is web-based too.
2. **Package with PWABuilder** (pwabuilder.com → iOS). Output is an Xcode
   *project* (Swift + WKWebView with service-worker and push support) — not
   a finished .ipa. Commit it to the repo.
3. **Build & upload in the cloud with Codemagic** (free tier: 500 macOS
   minutes/month; a wrapper build is ~10–15 min). Its App Store Connect
   integration creates the signing certificate and provisioning profile from
   an API key — no Mac, no Xcode — and uploads straight to
   TestFlight/App Store Connect. Alternatives: GitHub Actions macOS runners
   (free on public repos) + Codemagic CLI tools; MacinCloud ($1/hr) if you
   ever need to poke the project interactively.
4. **Survive Guideline 4.2 (minimum functionality)** — the big risk. Thin
   web wrappers get rejected; games fare better than content sites. Stack the
   deck before submitting:
   - **Offline play**: the NPC single-player mode working offline would be
     the strongest differentiator (currently requires Firestore).
   - **Push notifications** ("your roll") via the PWABuilder wrapper.
   - Haptics/sound (already present), no browser chrome, app-like navigation
     (already present).
   - Never describe it as a website in metadata. Expect 1–2 rejections as
     normal; respond via the Review Board with the native-capability list.
5. **Age rating:** Apple's 2025 questionnaire rates *frequent* simulated
   gambling **18+** (no middle tier). Unavoidable for a dice-wagering core
   loop; it limits discoverability but nothing else.
6. **Guideline 4.8 does not apply** (no third-party social login — anonymous
   Firebase auth is exempt). But **5.1.1(v)** has been applied to anonymous
   sessions: add a small "Reset my player / delete my data" control before
   submitting to Apple.
7. **Zero-cost fallback:** iOS Safari "Add to Home Screen" already works
   (standalone display, icons, and since iOS 16.4, web push for installed
   PWAs). Ship Play first, keep iOS as a PWA, and wrap for the App Store when
   ready.

---

## Remaining findings (not fixed here — prioritized backlog)

### Major — gameplay resilience (the "1-star review" cluster)

1. **Player who leaves mid-game becomes a permanent 30s zombie every round**
   (`src/firebase/ops.ts` — `leaveGame` no-ops unless `waiting`). No
   forfeit/kick mechanism; in a 2-player game the survivor waits 30s every
   other turn forever. Highest-impact remaining item.
2. **Leave button in play has no confirmation** (`src/screens/play.ts`) — one
   mistap abandons the table; combined with (1) it stalls everyone else. The
   glyph is also a hamburger (☰), which reads as "menu", not "leave".
3. **Host refresh orphans NPCs** (`src/npc.ts` — in-memory set only). A
   "vs computer" game degrades to 30s-per-round after any host reload. Fix:
   host re-adopts `npc-*` uids on rejoin.
4. **Out-of-order snapshot application during roll animation**
   (`src/game-bridge.ts` — async `handleDoc` is unserialized): a newer doc
   can be overwritten by an older one after a ~2s animation await. Needs a
   monotonic version guard or a serialized queue.
5. **Non-host players never see the buy-in in the lobby**
   (`src/screens/lobby.ts` hides the wager section for joiners) — chips are
   deducted invisibly. Also `refundWagers` lacks a `NOT_HOST` server-side
   assertion.
6. **No offline/reconnect UX** — no online/offline listeners, no connection
   banner, no `fromCache` awareness. Timer counts against frozen data.
7. **Filling the last seat auto-starts the game instantly** (`ops.ts`
   `joinRoom`) — no host confirm, and it makes wager + full table an
   unreachable flow.
8. **Turn deadlines trust the client clock** (`nowTs()` = `Date.now()`) — a
   skewed device can skip other players' turns via `advanceTurn`.

### Minor

- Rematch creates a solo room instead of bringing the table along
  (`src/screens/gameover.ts`).
- Room deleted ⇒ silent eject to splash, no toast (`src/game-bridge.ts`).
- Design fonts ("Bebas Neue", "DM Sans" in `tokens.css`) are never loaded —
  every user gets fallback fonts; load them or delete the tokens.
- Dead recent-rooms entries persist after ROOM_NOT_FOUND (`forgetRoom` is
  never called from `src/screens/splash.ts`).
- Firebase SDK statically bundled (`ops.ts` static-imports `real.ts`,
  defeating `auth.ts`'s dynamic import — Vite warns on every build); no
  inline boot splash in `index.html`, so slow-3G first paint is a black page.
- Lobby re-renders slots with `innerHTML` on every snapshot — taps landing
  mid-update are eaten.
- Invite modal a11y: no `aria-modal`, no focus trap, no Escape-to-close.
- Ten-mode dice are click-only `<div>`s — no keyboard path, no `aria-pressed`;
  rolled values have no text alternative for screen readers.
- `--text-dim` (#555 on #0a0a0a ≈ 3.2:1) fails WCAG AA at the 10–11px sizes
  where it's used.
- Reduced-motion still incurs the full ~1.9s roll-animation sleeps
  (`src/components/hand.ts`) — dead air instead of instant dice.
- Boot has no timeout — a hung `signInAnonymously` spins forever.
- Craps point silently wiped on turn timeout with no message.
- iOS first-tap sound often lost (`sfx.ts` schedules tones in the same tick
  as `ac.resume()`).

### Store/infra polish

- No security headers in `vercel.json` (`X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, CSP).
- No cache headers for `/icons/` and `/screenshots/`.
- Manifest: no `wide` form-factor screenshot (suppresses richer desktop
  install UI; Play's large-screen checklist wants one), no `shortcuts`, no
  `display_override`, no `monochrome` icon; `orientation: portrait` will be
  flagged by Play's tablet guidelines eventually.
- Sitemap lists only `/` — add `/privacy.html`.
- Privacy policy: bump "Last updated" whenever data behavior changes.

### Done well (keep it up)

Transactional integrity with stable error codes and idempotent settlement;
turn-timer auto-advance that can't deadlock; roll-animation dedup; 440-test
suite incl. rules harness; consistent XSS escaping; graceful degradation on
clipboard/share/QR/audio; complete manifest with true maskable icon and
labeled screenshots; honest privacy policy + in-app gambling disclaimers;
deploy-safe service worker with update toast.

---

## Sources (eligibility research)

- Play TWA codelab: https://developers.google.com/codelabs/pwa-in-play
- Play App Signing fingerprint gotcha: https://github.com/pwa-builder/pwabuilder-google-play/blob/main/Asset-links.md
- 12-tester requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Play gambling policy: https://support.google.com/googleplay/android-developer/answer/9877032
- Content ratings / IARC: https://support.google.com/googleplay/android-developer/answer/9859655
- Apple Developer web enrollment: https://developer.apple.com/programs/enroll/
- PWABuilder iOS packaging: https://docs.pwabuilder.com/#/builder/app-store
- Codemagic no-Mac signing: https://blog.codemagic.io/automatic-code-signing-for-ios-that-doesnt-require-a-mac/
- Apple Guideline 4.2: https://developer.apple.com/app-store/review/guidelines/#minimum-functionality
- Apple age ratings (2025 overhaul): https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Guideline 4.8 login services: https://developer.apple.com/app-store/review/guidelines/#login-services
- iOS web push for installed PWAs: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
