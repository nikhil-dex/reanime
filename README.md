# Re:Anime

Re:Anime is a desktop studio foundation for creating 2D, upper-body/waist-up chibi conversation videos. This repository establishes the local editor shell; it does not yet generate or render videos.

## v0.1 scope

- Tauri 2 desktop application scaffold with a Vite, React, and strict TypeScript frontend.
- Dark editor layout with asset categories, scene preview, object inspector, and a timeline placeholder.
- Minimal Zustand project/editor state and a sample scene featuring Kai with a neutral expression.
- PixiJS preview rendering a procedural placeholder character and resizing with its container.
- Empty, typed resource registry for future local assets.
- Save downloads the current project structure as JSON; New Project resets the sample project.

## Tech stack

- Tauri 2 and Rust desktop shell
- React, TypeScript, and Vite
- Tailwind CSS 4 via its Vite plugin
- Zustand for editor state
- PixiJS 8 for the scene preview

## Architecture

```text
src/
  components/       Editor panels, shared icons, and timeline
  data/             Sample scene and resource registry
  engine/pixi/      PixiJS preview component
  store/            Zustand editor state
  types/            Project, scene, character, and registry types
  App.tsx
  main.tsx
  styles.css
src-tauri/          Tauri 2 configuration and Rust application entry point
public/resources/   Reserved for local project resources
schemas/            Reserved for project/scene schemas
```

## Install and run

Install the JavaScript dependencies:

```sh
npm install
```

Run the frontend in a browser during UI development:

```sh
npm run dev
```

Run the Tauri desktop application (requires the platform prerequisites below):

```sh
npm run tauri dev
```

Check TypeScript and create a production frontend build:

```sh
npm run build
```

Tauri development requires Rust and Cargo, plus the operating-system prerequisites described in the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/).

## Current limitations

- Character art is a PixiJS-drawn placeholder; no artwork or asset import exists.
- Project saving downloads JSON; reopening/importing projects and file-dialog workflows are not implemented.
- Inspector values and timeline tracks are illustrative; editing scenes and characters is not yet implemented.
- The Render video button is intentionally disabled. Gemini, TTS, FFmpeg, animation tools, publishing, cloud automation, and databases are out of scope.
