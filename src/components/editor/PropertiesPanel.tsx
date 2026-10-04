import { Icon } from "../common/Icon";
import { resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";
import type { ArmPose, Eyes, Expression, Mouth } from "../../types/project";

const expressions: Expression[] = ["neutral", "happy", "angry", "shocked", "sad", "confused", "dead_inside"];
const eyes: Eyes[] = ["normal", "closed", "wide", "angry", "sad"];
const eyebrows = ["normal", "raised", "angry", "sad"] as const;
const mouths: Mouth[] = ["neutral", "smile", "open", "shout", "sad"];
const arms: ArmPose[] = ["neutral", "pointing", "crossed", "facepalm", "thumbs_up"];

export function PropertiesPanel() {
  const selected = useEditorStore((state) => state.project.scenes.find((scene) => scene.id === state.activeSceneId)?.characters.find((character) => character.id === state.selectedObjectId));
  const updateCharacter = useEditorStore((state) => state.updateCharacter);
  const character = selected ? resourceRegistry.characters[selected.characterId] : undefined;

  const select = <T extends string>(label: string, value: T, options: readonly T[], onChange: (next: T) => void) => (
    <label className="control-field"><span>{label}</span><select className="select-field" value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{option.replace("_", " ")}</option>)}</select></label>
  );

  return (
    <aside className="properties-panel panel">
      <div className="panel-heading"><div><span className="eyebrow">INSPECTOR</span><h2>Properties</h2></div><button className="icon-button small" aria-label="Layer order" title="Layer order"><Icon name="layers" /></button></div>
      {selected && character ? (
        <>
          <div className="selected-object"><span className="asset-avatar large">{character.name[0]}</span><span className="asset-copy"><strong>{character.name}</strong><small>Character · Visible</small></span><span className="more-button">•••</span></div>
          <div className="property-group">
            <div className="property-title"><span>CHARACTER</span><Icon name="chevron" /></div>
            {select("Character", selected.characterId, Object.keys(resourceRegistry.characters), (value) => updateCharacter({ characterId: value }))}
            {select("Expression", selected.expression, expressions, (value) => updateCharacter({ expression: value }))}
            {select("Eyes", selected.eyes, eyes, (value) => updateCharacter({ eyes: value }))}
            {select("Eyebrows", selected.eyebrows, eyebrows, (value) => updateCharacter({ eyebrows: value }))}
            {select("Mouth", selected.mouth, mouths, (value) => updateCharacter({ mouth: value }))}
            {select("Left Arm", selected.arms.left, arms, (value) => updateCharacter({ arms: { left: value } }))}
            {select("Right Arm", selected.arms.right, arms, (value) => updateCharacter({ arms: { right: value } }))}
          </div>
          <div className="property-group">
            <div className="property-title"><span>TRANSFORM</span><Icon name="chevron" /></div>
            <div className="coordinate-fields">
              <label className="number-field"><span>X</span><input type="number" min="0" max="1" step="0.01" value={selected.position.x} onChange={(event) => updateCharacter({ position: { ...selected.position, x: Number(event.target.value) } })} /><small>0–1</small></label>
              <label className="number-field"><span>Y</span><input type="number" min="0" max="1" step="0.01" value={selected.position.y} onChange={(event) => updateCharacter({ position: { ...selected.position, y: Number(event.target.value) } })} /><small>0–1</small></label>
            </div>
            <label className="field-label scale-label" htmlFor="scale">Scale</label>
            <label className="number-field"><span className="scale-icon">↗</span><input id="scale" type="number" min="0.1" max="4" step="0.05" value={selected.scale} onChange={(event) => updateCharacter({ scale: Number(event.target.value) })} /><small>×</small></label>
          </div>
          <div className="inspector-tip"><Icon name="spark" /><span>Changes update the live PixiJS preview immediately.</span></div>
        </>
      ) : <div className="inspector-empty">Select an object to view its properties.</div>}
    </aside>
  );
}
