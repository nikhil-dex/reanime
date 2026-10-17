import { AssetSidebar } from "./components/editor/AssetSidebar";
import { PreviewWorkspace } from "./components/editor/PreviewWorkspace";
import { PropertiesPanel } from "./components/editor/PropertiesPanel";
import { Icon } from "./components/common/Icon";
import { Timeline } from "./components/timeline/Timeline";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Project, TimelineTrack } from "./types/project";
import { useEditorStore } from "./store/editorStore";
import { exportProjectToMp4, type ExportProgress } from "./engine/render/exportProjectToMp4";

function downloadProject(project: ReturnType<typeof useEditorStore.getState>["project"]) {
  const content = JSON.stringify(project, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const trackKinds = new Set(["character", "background", "expression", "effect", "audio", "subtitle"]);

function validateTimelineTracks(value: unknown, duration: number): asserts value is TimelineTrack[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error("Scene timeline tracks must be an array.");
  const trackIds = new Set<string>();
  for (const track of value) {
    if (!isRecord(track) || typeof track.id !== "string" || !track.id.trim() || trackIds.has(track.id)
      || typeof track.name !== "string" || !trackKinds.has(String(track.kind)) || !Array.isArray(track.keyframes)) {
      throw new Error("A timeline track has an invalid ID, name, kind, or keyframe list.");
    }
    trackIds.add(track.id);
    if (track.targetId !== undefined && typeof track.targetId !== "string") throw new Error("Timeline target IDs must be strings.");
    for (const frame of track.keyframes) {
      if (!isRecord(frame) || !Number.isFinite(frame.time) || (frame.time as number) < 0
        || (frame.time as number) > duration || typeof frame.property !== "string" || !frame.property.trim()
        || !(frame.value === null || ["string", "number", "boolean"].includes(typeof frame.value))
        || (typeof frame.value === "number" && !Number.isFinite(frame.value))
        || (frame.interpolation !== undefined && frame.interpolation !== "linear" && frame.interpolation !== "hold")) {
        throw new Error("A timeline keyframe has an invalid time, property, value, or interpolation mode.");
      }
    }
    if (track.clips !== undefined) {
      if (!Array.isArray(track.clips)) throw new Error("Timeline clips must be an array.");
      const clipIds = new Set<string>();
      for (const clip of track.clips) {
        if (!isRecord(clip) || typeof clip.id !== "string" || !clip.id.trim() || clipIds.has(clip.id)
          || !Number.isFinite(clip.start) || (clip.start as number) < 0
          || !Number.isFinite(clip.duration) || (clip.duration as number) <= 0
          || (clip.start as number) + (clip.duration as number) > duration
          || (clip.resourceId !== undefined && typeof clip.resourceId !== "string")
          || (clip.properties !== undefined && !isRecord(clip.properties))) {
          throw new Error("A timeline clip has an invalid ID, time range, resource, or properties.");
        }
        clipIds.add(clip.id);
      }
    }
  }
}

function validateProject(value: unknown): Project {
  if (!isRecord(value)) throw new Error("The file must contain a project object.");
  if (typeof value.name !== "string" || !value.name.trim()) throw new Error("Project name is missing.");
  if (!Number.isInteger(value.width) || (value.width as number) < 1 || !Number.isInteger(value.height) || (value.height as number) < 1) throw new Error("Project dimensions are invalid.");
  if (!Number.isFinite(value.fps) || (value.fps as number) < 1 || (value.fps as number) > 240) throw new Error("Project FPS must be between 1 and 240.");
  if (!Array.isArray(value.scenes) || value.scenes.length === 0) throw new Error("Project must contain at least one scene.");
  const ids = new Set<string>();
  for (const item of value.scenes) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) throw new Error("Every scene must have a unique ID.");
    ids.add(item.id);
    if (typeof item.name !== "string" || !item.name.trim()) throw new Error("Every scene must have a name.");
    if (!Number.isFinite(item.duration) || (item.duration as number) <= 0 || (item.duration as number) > 600) throw new Error("Scene durations must be greater than 0 and no more than 600 seconds.");
    if (typeof item.background !== "string" || !Array.isArray(item.characters) || !isRecord(item.camera) || !Array.isArray(item.subtitles) || !Array.isArray(item.audio)) throw new Error("A scene is missing required fields.");
    if (!isRecord(item.camera.position) || !Number.isFinite(item.camera.position.x) || !Number.isFinite(item.camera.position.y) || !Number.isFinite(item.camera.zoom)) throw new Error("A scene camera is invalid.");
    validateTimelineTracks(item.tracks, item.duration as number);
    for (const character of item.characters) {
      if (!isRecord(character) || typeof character.id !== "string" || typeof character.characterId !== "string" || !isRecord(character.position) || !Number.isFinite(character.position.x) || !Number.isFinite(character.position.y) || !Number.isFinite(character.scale) || typeof character.visible !== "boolean" || !Number.isFinite(character.layer)) throw new Error("A character instance is invalid.");
    }
  }
  return structuredClone(value) as unknown as Project;
}

export default function App() {
  const project = useEditorStore((state) => state.project);
  const updateProjectName = useEditorStore((state) => state.updateProjectName);
  const resetProject = useEditorStore((state) => state.resetProject);
  const loadProject = useEditorStore((state) => state.loadProject);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<ExportProgress | null>(null);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const refreshResources = useEditorStore((state) => state.refreshResources);

  const exportVideo = async () => {
    if (rendering) return;
    setRendering(true);
    setFileError(null);
    setRenderMessage("Preparing video export…");
    setRenderProgress(null);
    try {
      const outputPath = await exportProjectToMp4(project, (progress) => {
        setRenderProgress(progress);
        setRenderMessage(`Rendering frames: ${progress.completedFrames.toLocaleString()} / ${progress.totalFrames.toLocaleString()}`);
      });
      if (outputPath) {
        setRenderMessage(`Video exported: ${outputPath}`);
      } else {
        setRenderMessage(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileError(message);
      setRenderMessage(null);
    } finally {
      setRendering(false);
    }
  };

  const openProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validated = validateProject(parsed);
      loadProject(validated);
      setFileError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open this project file.";
      setFileError(message);
      window.alert(`Could not open project: ${message}`);
    }
  };

  useEffect(() => {
    void refreshResources().catch((error: unknown) => {
      console.error("Character package failed to load", error);
    });
  }, [refreshResources]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <span>Re:<b>Anime</b></span>
          <span className="brand-divider" />
          <button className="project-name" onClick={() => {
            const name = window.prompt("Project name", project.name);
            if (name?.trim()) updateProjectName(name.trim());
          }}>{project.name}<span className="project-unsaved">•</span></button>
        </div>
        <div className="top-actions">
          <button className="text-action" onClick={() => {
            if (window.confirm("Start a new project? Any unsaved changes will be lost.")) {
              resetProject();
              setFileError(null);
            }
          }}><Icon name="plus" /> New project</button>
          <button className="text-action" onClick={() => fileInputRef.current?.click()}><Icon name="folder-open" /> Open</button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={openProject} />
          <button className="text-action save-action" onClick={() => downloadProject(project)}><Icon name="save" /> Save JSON</button>
          <span className="action-divider" />
          <button className="preview-button" onClick={() => setPlaying(!isPlaying)}><Icon name={isPlaying ? "pause" : "play"} /> Preview</button>
          <button className="render-button" disabled={rendering} onClick={() => void exportVideo()} title="Render the current project to MP4">{rendering ? "Rendering…" : "Render video"} <span>↗</span></button>
        </div>
      </header>
      <div className="editor-body">
        <AssetSidebar />
        <div className="main-column">
          <PreviewWorkspace />
          <Timeline />
        </div>
        <PropertiesPanel />
      </div>
      {fileError && <div role="alert" className="project-file-error">{fileError}</div>}
      {renderMessage && <div role="status" className="project-file-error">{renderMessage}{renderProgress && <progress max={1} value={renderProgress.progress} aria-label="Video render progress" />}</div>}
      <footer className="statusbar">
        <span><span className="status-dot" /> All changes local</span>
        <span>1920 × 1080 <i>·</i> 30 FPS</span>
        <span>Re:Anime <b>v0.1 foundation</b></span>
      </footer>
    </main>
  );
}
