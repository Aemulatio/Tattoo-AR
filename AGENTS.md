# Repository Guidelines

## Project Structure & Module Organization

This is a Vite, React, and TypeScript proof of concept for a browser-based AR tattoo preview. Application UI lives in `src/app/`; `src/App.tsx` is the entry component. Keep framework-independent AR logic in `src/ar-engine/`, organized by domain (for example, `camera/`, `tracking/`, `surfaces/`, and `tattoo/`). Put unit tests next to the code they cover as `*.test.ts`. Static browser assets belong in `public/`. Architectural constraints and phased delivery requirements are in `adr/0001-live-ar-tattoo-try-on.md`.

## Build, Test, and Development Commands

- `npm run dev` — start the Vite development server.
- `npm run build` — type-check and create a production build in `dist/`.
- `npm test` — run the Vitest suite once.
- `npm run typecheck` — run TypeScript project checks without emitting files.
- `npm run lint` / `npm run lint:fix` — check or auto-fix with Oxlint.
- `npm run format:check` / `npm run format` — verify or apply Prettier formatting.

Use HTTPS or localhost when testing camera access. Add `?debug=1` to the app URL for the development capability report and viewport grid.

## Coding Style & Naming Conventions

Use TypeScript with strict compiler settings, two-space indentation, and Prettier formatting. Name React components and exported types in `PascalCase`; use `camelCase` for functions, values, and file names such as `frame-scheduler.ts`. Keep math and rendering state out of React state. `ViewportTransform` is the single boundary for source-video, display-pixel, and NDC coordinate conversion; do not add local mirror or scale calculations elsewhere.

## Testing Guidelines

Use Vitest for deterministic unit tests. Add tests in the same change for coordinate transforms, geometry, filters, confidence, and other pure logic. Name files `*.test.ts` and use fixed inputs rather than live camera or ML inference. Run `npm test` before submitting changes; use `vitest related --run <changed-file>` to focus on affected tests.

## Commit & Pull Request Guidelines

Use Conventional Commits: `feat: add forearm surface`, `fix(camera): stop media tracks`, or `test: cover mirrored coordinates`. Lefthook formats staged files, runs Oxlint, type-checks, executes related tests, and validates the commit message. Keep pull requests focused; describe user-visible behavior and validation performed, link related issues, and include screenshots or recordings for camera/UI changes.

## Privacy & Scope

Do not add a backend, cloud upload, WebXR, full-body reconstruction, or new body regions without an ADR decision. Camera frames and uploaded tattoo images must remain on-device.
