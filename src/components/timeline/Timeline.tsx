import { useEffect } from "react";
import { Icon } from "../common/Icon";
import { useEditorStore } from "../../store/editorStore";
import { resourceRegistry } from "../../data/resourceRegistry";
import type { CharacterInstance, TimelineKeyframe, TimelineTrack } from "../../types/project";

const formatTime = (seconds: number) => {
  const wholeSeconds = Math.floor(seconds);
  return `00:${String(wholeSeconds).padStart(2, "0")}:${String(Math.round((seconds - wholeSeconds) * 30)).padStart(2, "0")}`;
};

function characterKeyframes(character: CharacterInstance, time: number): TimelineKeyframe[] {
  return [
    { time, property: "position.x", value: character.position.x, interpolation: "linear" },
    { time, property: "position.y", value: character.position.y, interpolation: "linear" },
    { time, property: "scale", value: character.scale, interpolation: "linear" },
    { time, property: "visible", value: character.visible, interpolation: "hold" },
    { time, property: "body", value: character.body, interpolation: "hold" },
    { time, property: "face", value: character.face, interpolation: "hold" },
    { time, property: "mouth", value: character.mouth, interpolation: "hold" },
    { time, property: "expression", value: character.expression, interpolation: "hold" },
    ...(character.eyes ? [{ time, property: "eyes", value: character.eyes, interpolation: "hold" as const }] : []),
    ...(character.eyebrows ? [{ time, property: "eyebrows", value: character.eyebrows, interpolation: "hold" as const }] : []),
  ];
}

export function Timeline() {
  const scenes = useEditorStore((state) => state.project.scenes);
  const activeSceneId = useEditorStore((state) => state.activeSceneId);
  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];
  const duration = activeScene?.duration ?? 12;
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const playhead = useEditorStore((state) => state.playhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setActiveScene = useEditorStore((state) => state.setActiveScene);
  const addScene = useEditorStore((state) => state.addScene);
  const duplicateScene = useEditorStore((state) => state.duplicateScene);
  const deleteScene = useEditorStore((state) => state.deleteScene);
  const renameScene = useEditorStore((state) => state.renameScene);
  const updateSceneDuration = useEditorStore((state) => state.updateSceneDuration);
  const moveScene = useEditorStore((state) => state.moveScene);
  const characters = activeScene?.characters ?? [];

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const state = useEditorStore.getState();
      const currentScene = state.project.scenes.find((scene) => scene.id === state.activeSceneId);
      if (!currentScene) return;
      const current = state.playhead;
      setPlayhead(current >= currentScene.duration ? 0 : Math.min(currentScene.duration, current + 1 / state.project.fps));
    }, 1000 / (useEditorStore.getState().project.fps || 30));
    return () => window.clearInterval(timer);
  }, [isPlaying, setPlayhead, activeSceneId]);

  const addCharacterKeyframe = () => {
    const state = useEditorStore.getState();
    const scene = state.project.scenes.find((item) => item.id === state.activeSceneId);
    const character = scene?.characters.find((item) => item.id === state.selectedObjectId);
    if (!scene || !character) return;
    const time = Math.min(scene.duration, Math.max(0, Math.round(state.playhead * state.project.fps) / state.project.fps));
    const tracks = [...(scene.tracks ?? [])];
    const index = tracks.findIndex((track) => track.kind === "character" && track.targetId === character.id);
    const nextFrames = characterKeyframes(character, time);
    if (index >= 0) {
      const existing = tracks[index];
      const otherFrames = existing.keyframes.filter((frame) => !(Math.abs(frame.time - time) < 1e-6));
      tracks[index] = { ...existing, keyframes: [...otherFrames, ...nextFrames].sort((a, b) => a.time - b.time) };
    } else {
      const track: TimelineTrack = {
        id: `track-character-${character.id}`,
        name: resourceRegistry.characters[character.characterId]?.name ?? character.characterId,
        kind: "character",
        targetId: character.id,
        keyframes: nextFrames,
      };
      tracks.push(track);
    }
    state.project.scenes = state.project.scenes.map((item) => item.id === scene.id ? { ...item, tracks } : item);
    useEditorStore.setState({ project: { ...state.project, scenes: [...state.project.scenes] } });
  };

  const renameActiveScene = () => {
    if (!activeScene) return;
    const name = window.prompt("Scene name", activeScene.name);
    if (name !== null) renameScene(activeScene.id, name);
  };

  return (
    <section className="timeline panel">
      <div className="timeline-toolbar">
        <div className="timeline-controls">
          <button className="transport-button" onClick={() => setPlayhead(0)} aria-label="Return to start">|◀</button>
          <button className="play-button" onClick={() => setPlaying(!isPlaying)} aria-label={isPlaying ? "Pause" : "Play"}>
            <Icon name={isPlaying ? "pause" : "play"} />
          </button>
          <button className="transport-button" onClick={() => setPlayhead(Math.min(duration, playhead + 1 / 30))} aria-label="Step forward">▶|</button>
          <span className="time-readout">{formatTime(playhead)} <span>/</span> {formatTime(duration)}</span>
        </div>
        <div className="timeline-tools">
          <label className="scene-duration-control" title="Active scene duration in seconds">
            <span>SEC</span>
            <input aria-label="Scene duration in seconds" type="number" min="0.1" max="600" step="0.5" value={duration} onChange={(event) => updateSceneDuration(activeSceneId, Number(event.target.value))} />
          </label>
          <span>FPS {useEditorStore.getState().project.fps}</span>
          <button className="text-action" onClick={addCharacterKeyframe} disabled={!useEditorStore.getState().selectedObjectId} title="Capture selected character's current state at the playhead">
            <Icon name="plus" /> Add keyframe
          </button>
        </div>
      </div>
      <div className="scene-strip" aria-label="Scene timeline">
        <div className="scene-strip-label">SCENES</div>
        <div className="scene-tabs">
          {scenes.map((scene, index) => (
            <button key={scene.id} className={`scene-tab${scene.id === activeSceneId ? " active" : ""}`} onClick={() => setActiveScene(scene.id)} title={scene.name}>
              <span className="scene-tab-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="scene-tab-name">{scene.name}</span>
              <small>{scene.duration}s</small>
            </button>
          ))}
        </div>
        <div className="scene-actions">
          <button className="scene-action-button add" onClick={addScene} title="Add scene" aria-label="Add scene">+</button>
          <button className="scene-action-button" onClick={() => activeScene && duplicateScene(activeScene.id)} disabled={!activeScene} title="Duplicate scene" aria-label="Duplicate scene">⧉</button>
          <button className="scene-action-button" onClick={renameActiveScene} disabled={!activeScene} title="Rename scene" aria-label="Rename scene">✎</button>
          <button className="scene-action-button" onClick={() => activeScene && moveScene(activeScene.id, -1)} disabled={!activeScene || scenes.findIndex((scene) => scene.id === activeSceneId) <= 0} title="Move scene left" aria-label="Move scene left">‹</button>
          <button className="scene-action-button" onClick={() => activeScene && moveScene(activeScene.id, 1)} disabled={!activeScene || scenes.findIndex((scene) => scene.id === activeSceneId) >= scenes.length - 1} title="Move scene right" aria-label="Move scene right">›</button>
          <button className="scene-action-button danger" onClick={() => activeScene && scenes.length > 1 && window.confirm(`Delete "${activeScene.name}"?`) && deleteScene(activeScene.id)} disabled={!activeScene || scenes.length <= 1} title="Delete scene" aria-label="Delete scene">×</button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <div className="track-header">TRACKS <button aria-label="Add character track" title="Add a character from the asset sidebar"><Icon name="plus" /></button></div>
          {characters.map((character) => <div className="track-name" key={character.id}><span className="track-color character" />{resourceRegistry.characters[character.characterId]?.name ?? character.characterId}</div>)}
          <div className="track-name"><span className="track-color background" />Background</div>
          {(activeScene?.tracks ?? []).map((track) => <div className="track-name" key={track.id}><span className={`track-color ${track.kind}`} />{track.name} · {track.keyframes.length} keys</div>)}
        </div>
        <div className="track-area">
          <div className="ruler">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} style={{ left: `${(index / 6) * 100}%` }}>{`00:${String(Math.round((index / 6) * duration)).padStart(2, "0")}`}</span>
            ))}
          </div>
          {characters.map((character) => (
            <div className="track-lane" key={character.id}>
              <button className="track-clip character" style={{ left: "0%", width: "100%" }} onClick={() => useEditorStore.setState({ selectedObjectId: character.id })} title={`Select ${character.characterId}`}>{character.characterId}</button>
            </div>
          ))}
          <div className="track-lane">
            <div className="track-clip background" style={{ left: "0%", width: "100%" }}>{activeScene?.background || "No background"}</div>
          </div>
          {(activeScene?.tracks ?? []).map((track) => (
            <div className="track-lane" key={track.id}>
              {track.keyframes.map((frame, index) => (
                <button key={`${frame.property}-${frame.time}-${index}`} className={`keyframe-marker ${track.kind}`} style={{ left: `${Math.min(100, Math.max(0, frame.time / duration * 100))}%` }} onClick={() => setPlayhead(frame.time)} title={`${frame.property} at ${frame.time.toFixed(3)}s`} aria-label={`Go to ${frame.property} keyframe`}>◆</button>
              ))}
            </div>
          ))}
          <button className="playhead" style={{ left: `${Math.min(100, Math.max(0, playhead / duration * 100))}%` }} onClick={(event) => {
            const rect = event.currentTarget.parentElement?.getBoundingClientRect();
            if (rect) setPlayhead(Math.min(duration, Math.max(0, ((event.clientX - rect.left) / rect.width) * duration)));
          }} aria-label="Timeline playhead" title="Click to seek"><span /></button>
        </div>
      </div>
    </section>
  );
}
