import { useEffect } from "react";
import { Icon } from "../common/Icon";
import { useEditorStore } from "../../store/editorStore";
import { resourceRegistry } from "../../data/resourceRegistry";

const formatTime = (seconds: number) => {
  const wholeSeconds = Math.floor(seconds);
  return `00:${String(wholeSeconds).padStart(2, "0")}:${String(Math.round((seconds - wholeSeconds) * 30)).padStart(2, "0")}`;
};

export function Timeline() {
  const duration = useEditorStore((state) =>
    state.project.scenes.find((scene) => scene.id === state.activeSceneId)?.duration ?? 12,
  );
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const playhead = useEditorStore((state) => state.playhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const characters = useEditorStore((state) => state.project.scenes.find((scene) => scene.id === state.activeSceneId)?.characters ?? []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const current = useEditorStore.getState().playhead;
      setPlayhead(current >= duration ? 0 : current + 1 / 30);
    }, 1000 / 30);
    return () => window.clearInterval(timer);
  }, [duration, isPlaying, setPlayhead]);

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
        <div className="timeline-tools"><span>30 FPS</span><span className="tool-divider" /><button className="zoom-button" aria-label="Timeline zoom">−</button><span>100%</span><button className="zoom-button" aria-label="Timeline zoom">+</button></div>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <div className="track-header">TRACKS <button aria-label="Add track"><Icon name="plus" /></button></div>
          {characters.map((character) => <div className="track-name" key={character.id}><span className="track-color character" />{resourceRegistry.characters[character.characterId]?.name ?? character.characterId}</div>)}
          <div className="track-name"><span className="track-color background" />Background</div>
        </div>
        <div className="track-area">
          <div className="ruler">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} style={{ left: `${(index / 6) * 100}%` }}>{`00:${String(index * 2).padStart(2, "0")}`}</span>
            ))}
          </div>
          <div className="track-lane">
            {characters.map((character) => <div className="timeline-clip character-clip" key={character.id}><span>{resourceRegistry.characters[character.characterId]?.name ?? character.characterId} · {character.body}</span></div>)}
          </div>
          <div className="track-lane">
            <div className="timeline-clip background-clip"><span>Placeholder background</span></div>
          </div>
          <div className="playhead" style={{ left: `${Math.min(playhead / duration, 1) * 100}%` }}><i /></div>
        </div>
      </div>
    </section>
  );
}
