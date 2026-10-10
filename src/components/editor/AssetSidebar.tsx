import { useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";
import {
  chooseCharacterPackage,
  installCharacterPackage,
  previewCharacterPackage,
} from "../../data/characterLibrary";
import type { CharacterImportPreview } from "../../types/characterLibrary";

const sections: { label: string; icon: IconName; detail: string }[] = [
  { label: "Characters", icon: "characters", detail: "Kai" },
  { label: "Backgrounds", icon: "backgrounds", detail: "Placeholder" },
  { label: "Expressions", icon: "expressions", detail: "Neutral" },
  { label: "Effects", icon: "effects", detail: "No effects" },
  { label: "Audio", icon: "audio", detail: "No audio" },
];

export function AssetSidebar() {
  const [active, setActive] = useState("Characters");
  const [importPreview, setImportPreview] = useState<CharacterImportPreview | null>(null);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const addCharacter = useEditorStore((state) => state.addCharacter);
  const refreshResources = useEditorStore((state) => state.refreshResources);
  useEditorStore((state) => state.resourceRevision);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const characters = Object.values(resourceRegistry.characters);

  const importCharacter = async () => {
    setImportError(null);
    try {
      const path = await chooseCharacterPackage();
      if (!path) return;
      setIsImporting(true);
      setImportPath(path);
      setImportPreview(await previewCharacterPackage(path));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

  const installPreview = async () => {
    if (!importPath) return;
    setImportError(null);
    setIsImporting(true);
    try {
      await installCharacterPackage(importPath);
      setImportPreview(null);
      setImportPath(null);
      await refreshResources();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

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
        <button className="icon-button small" aria-label="Import character" title="Import character package" onClick={() => void importCharacter()}>
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
            <button className="import-character-button" onClick={() => void importCharacter()} disabled={isImporting}>
              <Icon name="plus" /> {isImporting ? "Validating..." : "Import Character"}
            </button>
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
      {(importPreview || importError) && (
        <div className="library-modal-backdrop" role="presentation">
          <section className="library-modal" role="dialog" aria-modal="true" aria-labelledby="import-character-title">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CHARACTER LIBRARY</span>
                <h2 id="import-character-title">{importError ? "Invalid Character Package" : "Import Character"}</h2>
              </div>
              <button className="icon-button small" aria-label="Close" onClick={() => { setImportPreview(null); setImportError(null); }}>×</button>
            </div>
            {importError ? (
              <div className="library-error">{importError}</div>
            ) : importPreview ? (
              <div className="library-details">
                <h3>{importPreview.displayName}</h3>
                <p>Version {importPreview.version}</p>
                {importPreview.architecture && <p>{importPreview.architecture}</p>}
                {importPreview.canvas && <p>Canvas {importPreview.canvas.width} × {importPreview.canvas.height}</p>}
                <p>{importPreview.bodyPoseCount ?? "—"} body poses · {importPreview.faceVariantCount ?? "—"} face variants · {importPreview.mouthVariantCount ?? "—"} mouth variants</p>
                <div className="modal-actions">
                  <button className="select-field" onClick={() => { setImportPreview(null); setImportPath(null); }}>Cancel</button>
                  <button className="select-field package-calibration-button" onClick={() => void installPreview()} disabled={isImporting}>Install</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </aside>
  );
}
