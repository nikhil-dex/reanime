import { useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";

const sections: { label: string; icon: IconName; detail: string }[] = [
  { label: "Characters", icon: "characters", detail: "Kai" },
  { label: "Backgrounds", icon: "backgrounds", detail: "Placeholder" },
  { label: "Expressions", icon: "expressions", detail: "Neutral" },
  { label: "Effects", icon: "effects", detail: "No effects" },
  { label: "Audio", icon: "audio", detail: "No audio" },
];

export function AssetSidebar() {
  const [active, setActive] = useState("Characters");
  const addCharacter = useEditorStore((state) => state.addCharacter);
  const refreshResources = useEditorStore((state) => state.refreshResources);
  useEditorStore((state) => state.resourceRevision);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const characters = Object.values(resourceRegistry.characters);

  return (
    <aside className="asset-sidebar panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h2>Assets</h2>
        </div>
        <button className="icon-button small" aria-label="Refresh assets" title="Refresh character packages" onClick={() => void refreshResources()}>
          ↻
        </button>
        <button className="icon-button small" aria-label="Add asset" title="Asset importing is not available yet">
          <Icon name="plus" />
        </button>
      </div>
      <nav className="asset-nav" aria-label="Asset categories">
        {sections.map((section) => (
          <button
            className={`asset-nav-item${active === section.label ? " active" : ""}`}
            key={section.label}
            onClick={() => setActive(section.label)}
          >
            <Icon name={section.icon} />
            <span>{section.label}</span>
            <span className="asset-count">{section.label === "Characters" ? characters.length : "0"}</span>
          </button>
        ))}
      </nav>
      <div className="asset-section">
        <div className="section-label">{active.toUpperCase()}</div>
        {active === "Characters" ? (
          <>
            {characters.map((character) => (
              <button className={`character-asset${selectedObjectId?.startsWith(`${character.id}-`) ? " selected" : ""}`} key={character.id} onClick={() => addCharacter(character.id)}>
                <span className="asset-avatar">{character.name[0]}</span>
                <span className="asset-copy"><strong>{character.name}</strong><small>Sample character</small></span>
                <span className="status-dot" />
              </button>
            ))}
          </>
        ) : (
          <div className="empty-assets">
            <Icon name={sections.find((section) => section.label === active)?.icon ?? "spark"} />
            <span>{sections.find((section) => section.label === active)?.detail}</span>
          </div>
        )}
      </div>
      <div className="sidebar-footnote">
        <span className="status-dot" />
        <span>Local workspace</span>
      </div>
    </aside>
  );
}
