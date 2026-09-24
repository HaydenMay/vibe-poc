# Chromatic Drift Scene Design

## Goal

Add a second Vibe scene: a calm, near-black ambience with oversized rainbow ribbons and rippling color that respond distinctly to the existing audio readings. Users can switch between Chromatic Drift and Neon Rain in the browser and Lively builds.

## User-approved direction

- Keep Neon Rain and its current composition available.
- Add an on-screen scene picker in the bottom-right corner, adapted on small screens so it does not cover other controls.
- Use one active canvas environment at a time. Both environments receive the same `AudioReactiveFrame` from the existing render loop and providers.
- Call the new environment **Chromatic Drift** in the UI, subject to a later name change if requested.
- Treat the attached image as a reference to the existing audio debug readings. It does not define additional renderer or provider behavior.

## Scene appearance

- Paint a pure black base across the viewport.
- Render oversized, soft-edged, multi-hue ribbons that cross the screen at varied positions and angles. Their curves and reveal cycles should vary so the scene does not feel tiled or synchronized.
- Keep a fixed pool of six ribbon slots. Reuse slots with staggered, eased fades; audio must never increase the number of objects.
- At exact silence, render a pure black field. Near-zero readings may show only near-imperceptible color movement; large ribbons remain hidden until musical activity rises above the near-silence range. This keeps the scene suitable as a screensaver.
- Avoid harsh flicker, full-screen flashes, camera motion, and large scene-wide brightness changes.
- Shape the broad ribbons with smooth ripples and flowing color. Fine highlights should stay small and crisp.

## Audio mapping

Use scene-specific bounded nonlinear curves and smooth transitions. Sanitize and clamp inputs at the renderer boundary. Keep the provider normalization, smoothing, frequency grouping, and `AudioReactiveFrame` unchanged.

| Reading | Chromatic Drift responsibility |
| --- | --- |
| Volume | Lift ribbon color and glow while keeping the black field dominant. |
| Bass | Widen ribbons and deepen their broad wave amplitude. |
| Mid | Bend and ripple the ribbons, changing their spatial wave pattern. |
| High | Add small edge glints and fine color shimmer. |
| Energy | Increase the ribbons' drift and reveal-cycle speed. |
| Beat / Beat Strength | Send a brief local color ripple through the ribbons, with a short light accent. |

A detected beat is an impulse, not a one-frame effect. Its visual envelope lasts approximately 400–800 ms, fades naturally, and restarts or reinforces cleanly on nearby beats without accumulating. Beat strength without a beat creates no impulse. Combined readings are bounded so louder sections feel richer and more active while retaining black negative space.

## Scene selection and lifecycle

- Add an accessible native scene selector at the bottom-right for both builds.
- Selecting a scene stops the current `VibeEnvironment`, creates and starts the selected environment on the existing canvas, and resizes it to the current viewport. The shared render loop, debug panel, audio state, and browser/Lively providers remain in place.
- Keep one scene active at a time. Switching scenes must not restart microphone capture or the Lively callback.
- Keep the existing debug overlay available and keep the scene selector usable while the debug panel is open.

## Performance and compatibility

- Target the existing approximately 29 FPS baseline and prefer 30 FPS or higher on the same setup.
- Use the fixed six-slot ribbon pool and update object properties in place. Avoid per-frame large arrays, geometry rebuilding, DOM work, or Angular change detection.
- Do not change `AudioReactiveFrame`, `MicrophoneAudioProvider`, `LivelyAudioProvider`, their smoothing/grouping, Lively metadata, GitHub Pages configuration, or Neon Rain's design.
- Do not add a third environment, camera motion, spectrum UI, native audio code, or dynamic particle allocation.

## Acceptance checks

- Isolated synthetic frames demonstrate that volume, bass, mid, high, and energy each affect their assigned visual controls while leaving the other responsibilities mostly unchanged.
- A beat creates a local traveling ripple and short accent, then decays fully within the target interval. A frame without `beat: true` creates no new ripple.
- Exact silence remains pure black; near-zero readings remain pure black or show only near-imperceptible color, with no visible ribbon reveal or false beat effect.
- Combined moderate/high input remains bounded and does not turn the full field uniformly bright.
- Ribbon slot count remains six across audio changes and scene updates.
- Existing Lively audio tests pass. Browser production build, Lively production build, ZIP packaging, and TypeScript checks pass.
- Manually compare silence, quiet music, bass-heavy music, treble-heavy music, energetic mixed music, and clear drum transients in browser and Lively. Confirm the scene responds recognizably and stays near the current frame-rate baseline.

## Documentation

Update the README with the scene picker and a concise Chromatic Drift signal-to-scene mapping, including that each audio channel uses a tuned nonlinear response curve.
