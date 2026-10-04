import { ScenePreview } from "../../engine/pixi/ScenePreview";

export function PreviewWorkspace() {
  return (
    <section className="preview-workspace">
      <div className="preview-heading">
        <div>
          <span className="eyebrow">SCENE 01</span>
          <h2>First conversation</h2>
        </div>
        <span className="canvas-size">1920 <i>×</i> 1080</span>
      </div>
      <div className="canvas-stage">
        <div className="canvas-frame">
          <ScenePreview />
          <div className="canvas-corner top-left" />
          <div className="canvas-corner top-right" />
          <div className="canvas-corner bottom-left" />
          <div className="canvas-corner bottom-right" />
        </div>
        <div className="stage-caption"><span className="status-dot" /> LIVE PREVIEW</div>
      </div>
    </section>
  );
}
