# AGENTS.md — Onn 4K launcher (read this first, do not re-discover)

Keep this file static (no dates or run logs) so it stays a cacheable prompt prefix. Put per-session notes in chat, not here.

## 0. Rules
1. Connect to the box FIRST (section 1). Never build before `adb devices` shows it.
2. This repo IS the installed launcher's source. Diff and edit it; never rewrite from scratch or re-scaffold.
3. Apply file changes directly and test on the device yourself. Do not ask the user to approve or test.
4. Be concise. Don't re-explain Onn 4K or ADB basics.
5. Don't touch `android/` unless a native feature changes. The shell is stable.

## 1. Connect (always first)
- Device: Onn 4K Plus, `10.0.0.79:5555` (Wi-Fi ADB).
- `adb connect 10.0.0.79:5555`, then `adb devices` must show `device`. If offline: `adb kill-server; adb connect 10.0.0.79:5555`. If it still fails, tell the user to enable network debugging on the box.
- Use `adb -s 10.0.0.79:5555 ...` for every command.

## 2. Architecture
- Web UI: Next.js 16 static export (`output:'export'` in `next.config.mjs`; keep it, `standalone` breaks the build) → `out/`.
- Shell: Kotlin WebView app `com.hxxdy.launcher` in `android/`. Gradle `copyWebAssets` copies `out/` into the APK assets. The shell serves them at `https://launcher.local/` and exposes `window.LauncherBridge`.
- Shell files (`android/app/src/main/java/com/hxxdy/launcher/`):
  - `MainActivity.kt`: Back/Menu are sent as synthetic `Escape`/`ContextMenu` keydowns; fires `launcher:refresh` and `launcher:home` window events.
  - `LauncherBridge.kt`: the native bridge.
  - `LauncherWebViewClient.kt`: app icons at `https://launcher.local/__icon/<pkg>` (16:9 banners).

## 3. Native contract (UI code MUST honor)
All real data comes through `lib/native-bridge.ts`: `isNative, loadApps, loadContinueWatching, heroFromContinue, hasWatchNextAccess, requestWatchNextAccess, getNetwork, launchApp, launchIntent, openSystem, openAppInfo`.
- Apps are `{pkg, label, icon, service?}`. Continue items and slides have NO guaranteed `service`; it is optional everywhere. Never index `services[x]` without a guard. That exact crash broke the launcher before.
- Static demo data in `lib/launcher-data.ts` is only the browser (non-native) fallback.
- Never read localStorage or the bridge during first render. `tv-launcher.tsx` renders a blank `<main>` until a client `useEffect` sets `ready` (prevents React hydration error #418).
- Hero slides = trending movies and series only (`lib/nuvio-featured.ts`, Cinemeta catalog, cached 6 h in localStorage), shown only if `com.nuvio.tv` is installed. Do not put Continue Watching in the hero.
- Hero action text: "Playing" for trending (`logoIsAlpha`), "Resuming" otherwise.
- Nuvio deep link: `intent://tmdb/{type}/{id}#Intent;scheme=nuvio;...;package=com.nuvio.tv;...;end`.

## 4. File map (`components/tv/`)
- `tv-launcher.tsx`: controller. Zones nav/hero/continue/apps, key handling, long-press (500 ms on Enter over an app tile enters Organize & Move; App Info is an explicit button in the organize row), Enter activates on keyup, `launcher:home` resets, stack translate-Y scrolling. The launch overlay is shown first and the target app starts 300 ms later; the overlay clears itself after 2.2 s, and is also dropped explicitly on refresh, Home, resume and `visibilitychange` (WebView timers freeze behind another app, so a self-clearing overlay would otherwise still be on screen when the launcher is revealed).
- `theme-modal.tsx`, `theme-creator.tsx`: self-contained with their own key handling. `tv-launcher` key handling must return early while they are open.
- `top-header.tsx` takes `items` (native nav labels). `apps-row.tsx` renders `app.icon` as `<img>`. `launch-overlay.tsx` `LaunchState = {key, name, service?, icon?, action}`.
- `profile-modal.tsx`: the full-screen Profile menu, opened from the nav profile pill; wired in `tv-launcher` with `themes` and `onUpdateColor`.
  - Spatial zones `header` / `cards` / `actions` / `colors`; Back steps back one zone before closing.
  - The card strip is the reference's single `<ul>` (`justify-center`, `overflow-x-auto`). With all six profiles its centred overflow can push the first card past the left edge, where `scrollLeft` cannot reach it: that is the reference's own behaviour, kept for parity, so do not reintroduce a scroller wrapper unless the user asks.
  - Rename and naming a new profile open `TvKeyboard` in text mode; avatar swatches persist through `onUpdateColor`.
- `lib/profiles.ts`: profile state (`MAX_PROFILES = 6`, `PROFILE_COLORS`, localStorage keys `launcher.profiles` / `launcher.activeProfile`), loaded and saved only by `tv-launcher`.
- `your-taste-row.tsx`: the "Your Taste" deck (concave 3D poster carousel, dot indicators, focused-title pedestal). Items come from `lib/taste.ts`; `service` is optional and the row labels `Stream` when a pick has none.
- `lib/taste.ts`: builds the deck from the Watch Next titles the shell exposes (genre seeds, series detected from `S5 · E10` details) scored against the Cinemeta popularity catalogs Nuvio browses, cached 3 h in `launcher.taste.v1`, deep-linking each pick into Nuvio. Falls back to the bundled `tasteItems` when the network or history yields nothing.
- `lib/layout.ts`: `SHELF_ANCHOR`, the fraction of the viewport each shelf's top edge rests at when focused. The stack scroll and the hero's reserved bottom band both read it, so the hero can never sit under the next shelf's landing position. Each homepage section is one `dvh` tall (`hero-info.tsx` is `h-dvh` with a shrinkable band as its last child).
- `lib/utils.ts`: `cn`, `signedOffset` (circular index distance). `lib/navigation-sounds.ts`: remote-key click sounds. `title-lockup.tsx`: wordmark/fitted-text renderer shared by the shelves.
- `tv-keyboard.tsx`: the on-screen keyboard for both search bars and text entry, `mode: 'search' | 'text'` (default `search`). Mounted only while open; `apps-menu-modal` opens it only when the search bar is activated, never on focus or D-pad navigation. It uses the original full-size key metrics (780 px panel, `clamp(36px,4.4vh,46px)` keys), and Up from its top row is a no-op, as in the reference (Escape/Back and the close or Done control close it). In My Apps it searches the live Play catalog as you type, Done closes it and focuses the first result, and `Open Play` launches `market://search`. Profile renaming uses text mode.

## 5. Porting a new design (fast path)
When the user drops new UI code (e.g. `hxxdy (2)`, AI Studio exports):
1. Connect (section 1). Don't build yet.
2. Diff the drop against this repo's `components/tv/` and `lib/`. Port only visual/layout changes into the existing files.
3. Keep `native-bridge.ts`, `nuvio-featured.ts`, `profiles.ts`, the `tv-launcher.tsx` logic, and `next.config.mjs`. Never overwrite them with the drop's versions, and keep the optional-`service` types in `launcher-data.ts`.
4. Check every new component against section 3 (optional `service`, no static-data assumptions, no render-time storage/bridge reads) and section 7.
5. `npx tsc --noEmit` must be clean. The build has `ignoreBuildErrors`, so run it yourself.
6. Deploy and verify (section 6).

## 6. Build, deploy, verify
- Deploy: `cd C:\Users\kevin\Downloads\hxxdy; .\build-android.ps1 -Device 10.0.0.79:5555 -SetDefault` (web build + Gradle + install + set as home). The Gradle step takes about a minute; wait 400 s or more.
- Test: `adb -s D shell am force-stop com.nuvio.tv`, send `KEYCODE_HOME`, wait 8–10 s (earlier keys go to the previous app), then use `input keyevent KEYCODE_DPAD_*` / `KEYCODE_BACK`.
- Screenshot: `adb shell screencap -p /sdcard/x.png` then `adb pull` (PowerShell `>` corrupts PNGs). The pull lands in the current directory. If the viewer says "Path does not exist", retry or copy the file first.
- Errors: `adb logcat -d | Select-String "Uncaught|React error"`. A Chromium "This page couldn't load" screen means a console crash.
- Perf: `adb shell dumpsys gfxinfo com.hxxdy.launcher` (measure after a fresh start, not after heavy key spam).
- Pass criteria: hero shows trending titles with logos, theme menu opens and closes with Back, Down reaches Continue and Apps, no console errors.
- Delete screenshots (local and `/sdcard/*.png`) when done.

## 7. Performance rules (Cortex-A55)
No `backdrop-blur` (a rule in `globals.css` also neutralizes it), no `mix-blend-mode`, mount only current/previous/next hero slides, use `offsetLeft` rather than `getBoundingClientRect`, no smooth-scroll inside modals, keep transitions short (500 ms or less).
- Never animate a gradient angle or a filter radius. `.tv-conic-border` spins a conic layer with `transform`; `.tv-halo-glow` keeps a fixed blur and spins the same conic on the ring's own keyframes and `--tv-ring-duration` (4.2 s), so the hairline and the bloom orbit in lockstep, with the breathe on that same cycle. Animating `--tv-grad-angle` repainted the whole ring and re-blurred the halo every frame (that was the shelf stutter). The rotating gradient inside the blurred halo does re-blur, but only for the one focused halo: measured ~16 % janky frames idle vs 0.5 % with the sweep held still. Never put a rotating layer inside a blurred *shelf*.
- `.tv-conic-border` renders BEHIND the opaque surface it outlines and overhangs it by 1.5px. It is a SIBLING of that surface, placed inside the card container (button/tile wrapper) so it tracks the card's scale, tilt and spring in lockstep, but never a child of an `overflow-hidden` surface, which would clip the overhang away. Call sites pass that surface's radius inline. Never go back to a mask ring: **no** mask form clips on this WebView. The reference's `mask` + `mask-composite: exclude` pair leaves both layers opaque and floods the button, and so does the legacy `-webkit-mask` + `-webkit-mask-composite: xor` pair (both rebuilt and photographed: the focused Continue card and the hero Play pill turned into a flat conic wash). That is why the band is produced geometrically, by the wrapper's 1.5px overhang past an opaque surface. Consequence: the ring can only be a sibling BEHIND the surface it outlines. Putting it inside the pill/surface (as the reference does) paints the whole gradient across the button — that is the one change that must never be made. Its spinning layer is a square of 200 % the surface width, not a copy of the surface's rect: a rect at the card's aspect ratio cannot cover it once rotated, and a 2.5:1 pill lost its end caps at 45° so the hairline broke mid-sweep. The spare area is clipped by the wrapper.
- Carousel motion is `motion/react` springs (Continue Watching stiffness 205, Your Taste 215, both damping 25 / mass 0.92) on `transform`, plus `width`/`height` for Continue Watching. This is the design and was restored deliberately for visual parity: main-thread-framed springs re-raster every perspective card each frame, so this shelf is the most expensive part of the UI (measured ~36–39 % janky frames while moving Continue focus, vs ~15–17 % idle). Do not "fix" it by swapping the springs for `linear()` CSS transitions or by moving the halo/ring to a stage layer: both change the look and the user rejected them. Optimize inside that constraint (fewer mounted cards, cached logo luminance probes, deferred bridge refresh after paint).
- The carousels mount only the cards within ±2 of the selection; anything further is not rendered. Focus halos and rings live INSIDE the card container, around the card surface, never in a static stage layer, so every border, halo and highlight moves, scales and tilts with its card on every frame.
- A blurred, spinning halo is a child of a card that the spring scales, so it re-rasterizes its blur while the row animates. That cost is part of the approved design. Never add a second such layer per card, and never put one on a shelf that is not focused.
- Each carousel keeps a `settling` flag (520 ms after the selection changes) and passes it to its cards, which mount `.tv-halo-fake` - one radial gradient, same envelope, no filter - instead of `.tv-halo-glow` for that window. This is deliberately React state and not a CSS attribute selector: the attribute version measured no better than no change at all. The same window pauses the conic sweep through `[data-settling]`. With the stand-in the Continue shelf measures ~36-40 % janky frames in focus movement and ~15-16 % idle.
- What is left on Continue is the `width`/`height` spring itself, not the bloom and not the shadows. Measured on the same build, same session: Continue 37-40 %, Your Taste 14.4 % (same 205/215 spring, same halo, but a fixed card size), My Apps 8.7 % (transforms only). Removing the bloom during the spring entirely changed nothing (37-39 %), and neither a single small cast shadow nor mounting two fewer off-screen cards moved it. So do not spend more effort on filters or shadows for this shelf: it re-lays-out seven cards and re-rasters their artwork at every intermediate width, and that is the cost. Going under ~15 % means replacing the resize (clip a fixed-size artwork layer, or transform-scale the box with counter-scaled content), which changes how side cards frame their artwork mid-slide and needs sign-off first.
- The orbiting bloom is the single most expensive thing in the UI, and it is the bloom, not the springs: disabling only `.tv-halo-glow`'s `filter: blur()` takes Continue Watching focus movement from ~40 % to ~17 % janky frames and idle from ~15 % to 0.5 %, while `framestats` shows traversal 0.3 ms / draw 0.5 ms per frame. The blur must follow the clip (clip then blur), so it can never be composited as "blur once, rotate the result": every frame re-filters the card's whole silhouette (~370 k px at `38vw`). Two cuts are in the shipped design: the Continue shelf's halo blurs at 8 px instead of the reference 13 px (that silhouette is `38vw`, the largest filter pass in the UI), and the sweep is frozen for the window a carousel spring is in flight — each row sets `data-settling` on its `<section>` for 520 ms after the selection changes, and `[data-settling] .tv-conic-border::before, [data-settling] .tv-halo-glow::before { animation-play-state: paused }` parks the orbit. The bloom still sweeps at rest and resumes at the same angle; measured 37.5 % without the pause vs 36 % with it. Ruled out by measurement, do not re-try: a fixed-size spinning ring raster (`--tv-ring-size`, since removed — no change; the square is back to 200 % of the surface width), laying the halo out at half size and scaling it up with a halved blur (Chromium rasters at the final scale, 15.7 %/46 %: no change), `will-change: filter` (no change). The floor: with the blur disabled the same scene measures ~17 % moving and 0.5 % idle, so what remains is the re-filter itself, once per frame, for as long as the box changes.
- Baselines on Continue Watching, same scene, `dumpsys gfxinfo` after a fresh start: the stage-halo build this UI was restored from measured ~48 % janky / 46–48 ms in focus movement and 19.5 % idle; the current in-card build (8 px bloom, paused sweep) measures ~34–39 % / 42–48 ms and ~14.6–16 % idle. The 4.5 %/21 % figures above come from a different scene, so do not use them as this shelf's target.

## 8. Known gotchas
- Mojibake like `Â·` means a file was saved with the wrong encoding. Write UTF-8 without BOM.
- Back on the box is handled in JS via the synthetic `Escape`; don't add `onBackPressed` logic to the shell.
- If the launcher is bricked: `adb shell cmd package set-home-activity <other launcher>` or `pm disable-user` the broken one.

## 9. Backup before risky changes
Before replacing UI wholesale, copy `components/`, `lib/`, `app/` to `..\hxxdy-backup-<yyyymmdd>\` (outside the repo) so a bad port can be rolled back without relearning.
