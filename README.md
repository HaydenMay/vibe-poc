# Vibe POC

A one-screen iPhone Safari experiment: does music from the same iPhone's built-in speakers keep playing while this page captures its microphone, and do the meters react? Microphone samples are analyzed locally with Web Audio. The page does not record, store, upload, or play back captured audio.

## Run locally

Use Node.js 22.12+ or a supported Node.js 24 release.

```sh
npm ci
npm start
```

Local desktop testing works at `http://localhost:4200`. An iPhone needs an HTTPS deployment for microphone access.

## Deploy to GitHub Pages

1. Create a **public, empty** GitHub repository with any name. Do not add a README or `.gitignore` on GitHub.
2. In this folder, run the commands below, replacing `YOUR-USERNAME` and `YOUR-REPO` with the actual GitHub account and repository names.
3. In the repository, open **Settings → Pages → Build and deployment**, and set **Source** to **GitHub Actions**. Wait for the **Deploy Vibe POC to GitHub Pages** workflow to finish.
4. On the iPhone, open `https://YOUR-USERNAME.github.io/YOUR-REPO/` in Safari. For a repository named `YOUR-USERNAME.github.io`, use `https://YOUR-USERNAME.github.io/` instead.

```sh
git init
git branch -M main
git add .
git commit -m "Add Vibe microphone POC"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

The workflow derives Angular's base href from the real repository name. It uses the root path automatically for a `YOUR-USERNAME.github.io` repository.

## Same-iPhone test

Use the built-in speakers, not headphones. Play a song in Apple Music, open Vibe in Safari, tap **Start Listening**, and allow microphone access. Record whether the music continues, pauses, changes volume or output route, or resumes from Control Center while Vibe stays visible. Note whether the meters and beat circle react. Repeat from **Spotify** and **Suno**. Compare a quiet passage, a bass-heavy passage, speech, and silence. If music stops, that is a valid result; the page deliberately makes no audio-session changes.

When reporting a strange result, include the iPhone model and iOS version, service, playback result, Capture and AudioContext values, sample rate, `audioSession` value, actual microphone track settings, and any error shown.
