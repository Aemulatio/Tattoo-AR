# Live AR Tattoo Try-on

Phase 0 of the browser-based, local-only forearm try-on proof of concept.

## Selected versions

- React 19.2.8, Vite 8.2.2, TypeScript 6.0.2
- MediaPipe Tasks Vision 1.0.1 and Three.js 0.185.1 (installed, deliberately unused until Phase 1)
- Vitest 4.0.18

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

Open the app over HTTPS (or localhost) and choose **Start camera**. Add `?debug=1` to show the capability report and display grid. Camera frames stay in the browser and are not uploaded.

## Architecture boundary

`ViewportTransform` is the sole conversion boundary between source video, display pixels, and renderer NDC. The visible selfie preview is mirrored; tracker input in later phases remains canonical and unmirrored.
