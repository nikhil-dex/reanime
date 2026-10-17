import { useEffect } from "react";
import { Icon } from "../common/Icon";
import { useEditorStore } from "../../store/editorStore";
import { resourceRegistry } from "../../data/resourceRegistry";

const formatTime = (seconds: number) => {
  const wholeSeconds = Math.floor(seconds);
  return `00:${String(wholeSeconds).padStart(2, "0")}:${String(Math.round((seconds - wholeSeconds) * 30)).padStart(2, "0")}`;
};

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
        </div>
        <div className="track-area">
          <div className="ruler">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} style={{ left: `${(index / 6) * 100}%` }}>{`00:${String(Math.round((index / 6) * duration)).padStart(2, "0")}`}</span>
            ))}
          </div>
          {characters.map((character) => (
            <div className="track-lane" key={character.id}>
              <div className="timeline-clip character-clip"><span>{resourceRegistry.characters[character.characterId]?.name ?? character.characterId} · {character.body}</span></div>
            </div>
          ))}
          <div className="track-lane">
            <div className="timeline-clip background-clip"><span>{activeScene?.background ?? "Background"}</span></div>
          </div>
          <div className="playhead" style={{ left: `${Math.min(playhead / duration, 1) * 100}%` }}><i /></div>
        </div>
      </div>
    </section>
  );
}
