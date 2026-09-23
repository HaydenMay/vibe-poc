# Vibe — Neon Rain

An ambient, music-reactive iPhone Safari experiment. Neon Rain runs continuously as a quiet night scene; music heard through the microphone changes its glow, fog, rain, and reflections. Audio analysis stays on the device. The app does not record, store, upload, or play back microphone audio.

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

## Test on iPhone

Play music through an external or AirPlay speaker within earshot of the iPhone. Open Vibe, tap **Start Vibe**, and allow microphone access. Tap **Debug** to see Volume, Bass, Mid, High, Energy, Beat, FPS, microphone settings, and audio-session diagnostics. Hide Debug to view the scene. **Stop** releases the microphone; Start Vibe can be used again.

Try a quiet song, a bass-heavy song, an energetic pop or rock song, and a song with clear drum transients. Bass should deepen neon glow and wet-road reflections; mids should move fog and rain; highs should pick out droplets and light points; transients should briefly accent the neon. The baseline scene should keep moving in silence.

The Audio Session selector from the earlier same-iPhone experiment remains available. Leave it on Auto for this external-speaker test.
