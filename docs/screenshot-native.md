# Native Screenshot Detection — Architecture Blueprint

> This document is a **design reference only**. TheraBridge currently ships a
> web client + Node backend; there is **no React Native / native mobile app** in
> this repository, so no native code exists. When a mobile app is built, this
> blueprint describes how the native screenshot-detection layer should be
> implemented and wired to the existing backend.

## Honest boundary

A normal web browser does **not** have reliable access to OS-level screenshot
events, and cannot detect captures taken by another application. The native
Android/iOS apps are the only place "os-level" detection is possible. The web
implementation is and must remain heuristic (see `frontend/src/lib/classification.ts`).

## Platform detection capability (matches `frontend/src/lib/protectionTypes.ts`)

| Platform | detectionCapability | canPrevent |
|----------|--------------------|------------|
| web      | heuristic          | false      |
| android  | os-level           | true       |
| ios      | os-level           | true       |

## React Native bridge abstraction

The JavaScript layer should expose a platform-neutral service. Native Android
code lives in the Android native layer; native iOS code in the iOS native layer.

```ts
// ScreenshotProtectionService (JS, platform-neutral)
export interface ScreenshotProtectionService {
  startMonitoring(contentId: string, contentType: string): void
  stopMonitoring(): void
  setProtectionMode(mode: "detect" | "prevent" | "detect-and-notify"): void
  // Native callbacks surface as:
  // onCapture({ eventType, confidence: "confirmed", detectionMethod }) 
}
```

Native events are reported to the existing backend:

```
POST /api/protected/session        (create viewing session, get sessionToken)
POST /api/screenshot-events        (report confirmed event)
```

with `platform: "android" | "ios"`, `detectionMethod: "android_os" | "ios_os"`,
`confidence: "confirmed"`, and a valid `sessionToken`. The server still validates
the session, dedups (`ingestionKey`), and notifies the owner.

## Android

- **Modern detection (Android 14+, API 34):** use the official
  `ScreenshotCallback` via
  `Activity.ScreenshotListener` / `WindowManager.addScreenshotListener()`. This
  fires on both hardware-button screenshots and the system screenshot UI.
- **Prevention where the product wants prevention (not notification):** use
  `WindowManager.LayoutParams.FLAG_SECURE`. **Important:** only use `FLAG_SECURE`
  on screens where the requirement is "prevent the capture". Do **not** use it on
  screens where the requirement is "allow screenshot but notify the content
  owner" — `FLAG_SECURE` prevents the screenshot entirely and suppresses the
  `ScreenshotCallback` on some devices, so it would break the notify path.
- **Fallback (older Android):** where the modern callback is unavailable, rely on
  `onWindowFocusChanged(false)` / `onStop()` as coarse heuristics reported with
  `confidence: "heuristic"` or `"probable"` — never `"confirmed"`.

## iOS

- **Screenshot notification:** listen for
  `UIApplication.userDidTakeScreenshotNotification`. Returns a `UIApplication`
  notification on supported iOS versions.
- **Screen-capture / recording state:** use `UIScreen.main.isCaptured`
  (`isCaptured` KVO) to detect AirPlay mirroring / on-device screen recording in
  real time. Treat as `confidence: "confirmed"` only where the OS guarantees it;
  otherwise `heuristic`.

## Test matrix (when native app exists)

**Android:** Android 14+ (callback), supported older versions (focus/stop
heuristics), hardware screenshot buttons, gesture screenshot, system screenshot
UI, screen recording, `FLAG_SECURE` behavior for prevent-mode screens.

**iOS:** supported iOS versions, hardware screenshot, AssistiveTouch screenshot,
screen recording (`isCaptured`), AirPlay/mirroring.

**Web (current):** Chrome/Firefox/Edge/(Safari if supported) on Windows/macOS/
Linux. PrtScr, Snipping Tool, OS screenshot shortcuts, browser screenshot tools,
tab/window switching, fullscreen, DevTools, screen recording — and honestly
document which are detectable (`probable`/`heuristic`) vs impossible from browser
JS. See the backend `README.md` "Privacy Shield" limitations.
