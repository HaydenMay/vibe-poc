# Vibe — Neon Rain

Vibe is a music-reactive ambient scene with two environments. Use the bottom-right scene picker to switch between Neon Rain, a quiet night city, and Chromatic Drift, colorful ribbons flowing over black. The browser build uses the microphone after you press **Start Vibe**; the local Lively Wallpaper build uses Windows system audio without microphone access.

## Run locally

Use Node.js 22.12+ or a supported Node.js 24 release.

```sh
npm ci
npm start
```

The app runs at `http://localhost:4200` for desktop testing. An iPhone needs HTTPS for microphone access.

## GitHub Pages

The existing `main` branch deploys via `.github/workflows/pages.yml`. In the GitHub repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The workflow determines the Angular base href from the repository name.

Open `https://haydenmay.github.io/vibe-poc/` in iPhone Safari after the deployment succeeds.

## Build for Lively Wallpaper

Use Node.js 22.12+ or a supported Node.js 24 release.

```sh
npm ci
npm run build:lively
```

The command creates both:

- `dist/lively/` — the ready-to-import local webpage project, with `LivelyInfo.json` and `index.html` at its root.
- `dist/Vibe-Neon-Rain-Lively.zip` — the same project as a Lively import package.

To import it, drag `dist/Vibe-Neon-Rain-Lively.zip` into the Lively window and add it to the library. Select **Vibe - Neon Rain** to set it as a wallpaper. Lively's webpage project metadata requests `--audio` and enables its documented pause notification; there is no microphone permission prompt in this build.

The Lively build uses a relative Angular base path so its hashed JavaScript, CSS, and other assets load from the local package. `npm run build:web` is the production browser build used for the hosted site. The existing GitHub Pages workflow continues to set its repository-specific base path.

Lively sends 128 ordered spectrum values. The [current webpage guide](https://github.com/rocksdanister/lively/wiki/Web-Guide-V-:-System-Data) and [official sample](https://github.com/rocksdanister/audio-visualizer-wallpaper/tree/main/src/Simple%20visualizer) identify the array as system audio data and plot the entries in order, but do not define exact frequency boundaries for each index. Vibe groups entries 0–15 as bass, 16–55 as mid, and 56–127 as high. It sanitizes non-finite and negative values, bounds unusually large values, adapts sensitivity to a recent peak, and smooths the values before passing an `AudioReactiveFrame` to Neon Rain. Debug shows raw peak and average so real Lively output can be checked.

For system audio, use Lively's **Visualizer Audio Source** setting and select **Default** to follow Windows' current playback device, or choose a specific device such as your headphones. Then play audio in any Windows app; the wallpaper status should read **SYSTEM AUDIO · LIVELY**. Lively's `--audio` callback supplies the data, so Vibe does not capture headphone or speaker sound through a microphone.

To use the same wallpaper as a full-screen screensaver, first set Vibe as your Lively wallpaper. For the Microsoft Store version, open **Settings → Screensaver** in Lively and follow its built-in setup. For the installer version, follow Lively's [screensaver setup guide](https://github.com/rocksdanister/lively/wiki/Screen-Saver) to install its Windows screensaver file, then select **Lively** in Windows' screensaver settings. Lively launches webpage wallpapers as screensavers across the display; Vibe sizes its scene to fill that viewport. The Microsoft Store version must stay running in the background; the installer version can run its screensaver independently. No separate Vibe screensaver application is needed.

## Verify audio providers and scene response

```sh
npm run test:scene
npm run test:lively
npm run build:web
npm run build:lively
```

The scene checks cover independent audio-to-city responses, nonlinear moderate-level sensitivity, beat ripple start/decay, sparse ambient event timing, silent-scene movement, depth-layer speeds, and fixed particle counts. The Lively provider checks exercise its global callback, low/mid/high response, transient detection, silence decay, malformed input, pause/resume, listener cleanup, and the absence of microphone requests. The normal Angular production builds type-check both browser and Lively configurations.

### Audio response by scene

Neon Rain maps **Volume** to city and neon illumination, **Bass** to wet-road reflections, **Mid** to fog and skyline-window movement, **High** to rain glints and motes, **Energy** to rain and wind activity, and **Beat** to an expanding road ripple and light accent.

Chromatic Drift maps **Volume** to ribbon visibility and glow, **Bass** to ribbon width, **Mid** to wave bends and ripples, **High** to fine glints, **Energy** to ribbon flow, and **Beat** to a traveling color accent. Exact silence stays black.

Each channel uses its own bounded nonlinear response curve rather than a direct linear mapping, so moderate readings create visible motion while loud sections remain controlled. Both scenes keep a fixed pool of visual elements.

During silence, Neon Rain keeps three fixed depth ranges of rain, independently drifting fog, slowly moving foreground motes, gentle light breathing, and occasional timed city events. Ambient events use long cooldowns and smooth envelopes.

## Test on iPhone

Play music through an external or AirPlay speaker within earshot of the iPhone. Open Vibe, tap **Start Vibe**, and allow microphone access. Tap **Debug** to see Volume, Bass, Mid, High, Energy, Beat, FPS, microphone settings, and audio-session diagnostics. Hide Debug to view the scene. **Stop** releases the microphone; Start Vibe can be used again.

Try silence, quiet or ambient music, bass-heavy music, treble-heavy music, energetic mixed music, and a song with clear drum transients. Volume should lift city illumination; bass should deepen and widen road reflections; mids should animate fog and distant windows; highs should brighten fine rain and motes; energy should increase rain and wind activity; and beats should send a temporary ripple toward the viewer. The baseline scene should keep moving in silence, and different music sections should be recognizable from the city without the debug panel.

The Audio Session selector from the earlier same-iPhone experiment remains available. Leave it on Auto for this external-speaker test.
