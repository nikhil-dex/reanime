import { Icon } from "../common/Icon";
import { useEditorStore } from "../../store/editorStore";

export function PropertiesPanel() {
  const selected = useEditorStore((state) =>
    state.project.scenes
      .find((scene) => scene.id === state.activeSceneId)
      ?.characters.find((character) => character.id === state.selectedObjectId),
  );

  return (
    <aside className="properties-panel panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INSPECTOR</span>
          <h2>Properties</h2>
        </div>
        <button className="icon-button small" aria-label="Layer order" title="Layer order">
          <Icon name="layers" />
        </button>
      </div>
      {selected ? (
        <>
          <div className="selected-object">
            <span className="asset-avatar large">K</span>
            <span className="asset-copy"><strong>Kai</strong><small>Character · Visible</small></span>
            <span className="more-button">•••</span>
          </div>
          <div className="property-group">
            <div className="property-title"><span>TRANSFORM</span><Icon name="chevron" /></div>
            <label className="field-label">Position</label>
            <div className="coordinate-fields">
              <div className="number-field"><span>X</span><input value="960" readOnly aria-label="Position X" /><small>px</small></div>
              <div className="number-field"><span>Y</span><input value="626" readOnly aria-label="Position Y" /><small>px</small></div>
            </div>
            <label className="field-label scale-label" htmlFor="scale">Scale</label>
            <div className="number-field"><span className="scale-icon">↗</span><input id="scale" value={selected.scale.toFixed(2)} readOnly /><small>×</small></div>
          </div>
          <div className="property-group">
            <div className="property-title"><span>APPEARANCE</span><Icon name="chevron" /></div>
            <label className="field-label" htmlFor="expression">Expression</label>
            <button className="select-field" id="expression">
              <span><span className="expression-dot" />{selected.expression}</span><Icon name="chevron" />
            </button>
          </div>
          <div className="property-group layer-group">
            <div className="property-title"><span>LAYER</span><Icon name="chevron" /></div>
            <div className="layer-row"><span><Icon name="layers" /> Order</span><strong>{selected.layer}</strong></div>
          </div>
          <div className="inspector-tip"><Icon name="spark" /><span>Select an object in the scene to edit its properties.</span></div>
        </>
      ) : (
        <div className="inspector-empty">Select an object to view its properties.</div>
      )}
    </aside>
  );
}
