import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";
import {
  chooseCharacterPackage,
  installCharacterPackage,
  previewCharacterPackage,
  listInstalledCharacterPackages,
  removeCharacterPackage,
  assetUrl,
} from "../../data/characterLibrary";
import type { CharacterImportPreview, CharacterPackageSummary } from "../../types/characterLibrary";

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
  const [installed, setInstalled] = useState<CharacterPackageSummary[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("recent");
  const [pendingDelete, setPendingDelete] = useState<CharacterPackageSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const addCharacter = useEditorStore((state) => state.addCharacter);
  const activateCharacter = useEditorStore((state) => state.activateCharacter);
  const refreshResources = useEditorStore((state) => state.refreshResources);
  useEditorStore((state) => state.resourceRevision);
  const characters = Object.values(resourceRegistry.characters);
  const project = useEditorStore((state) => state.project);
  const setCalibrationMode = useEditorStore((state) => state.setCalibrationMode);
  const reloadLibrary = async () => setInstalled(await listInstalledCharacterPackages());
  useEffect(() => { void reloadLibrary().catch((error: unknown) => setImportError(String(error))); }, []);
  const visiblePackages = useMemo(() => installed.filter((item) => item.displayName.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "name" ? a.displayName.localeCompare(b.displayName) : b.importedAt - a.importedAt), [installed, query, sort]);

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
      await reloadLibrary();
      setNotice("Character imported successfully.");
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
            <input className="library-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search characters" aria-label="Search characters" />
            <select className="library-sort" value={sort} onChange={(event) => setSort(event.target.value as "name" | "recent")} aria-label="Sort characters"><option value="recent">Recently imported</option><option value="name">Name</option></select>
            <button className="import-character-button" onClick={() => void importCharacter()} disabled={isImporting}>
              <Icon name="plus" /> {isImporting ? "Validating..." : "Import Character"}
            </button>
            {installed.length === 0 ? <div className="empty-assets">No imported characters yet. Import a character package to get started.</div> : visiblePackages.map((item) => {
              const character = characters.find((entry) => entry.id === item.characterId);
              return <article className="library-card" key={`${item.characterId}@${item.version}`}>
                {item.previewPath ? <img className="library-thumb" src={assetUrl(item.previewPath)} alt="" /> : <span className="asset-avatar">{item.displayName[0]}</span>}
                <div className="asset-copy"><strong>{item.displayName}</strong><small>v{item.version} · {item.status === "error" ? "Needs reimport" : item.status === "missing" ? "Missing" : "Ready"}</small>{item.status === "error" && item.error ? <small className="library-error">{item.error}</small> : <small>{item.bodyPoseCount ?? 0} poses · {item.faceVariantCount ?? 0} expressions</small>}</div>
                <div className="library-actions">
                  <button onClick={() => { if (character) { activateCharacter(character.id); addCharacter(character.id); setCalibrationMode(false); } }} disabled={!character} title="Use Character">Use</button>
                  <button onClick={() => { if (character) { activateCharacter(character.id); setCalibrationMode(true); } }} disabled={!character} title="Edit or calibrate">Calibrate</button>
                  <button className="danger-action" onClick={() => setPendingDelete(item)} title="Delete Character" disabled={item.status === "error"}>Delete</button>
                </div>
              </article>;
            })}
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
      {pendingDelete && <div className="library-modal-backdrop"><section className="library-modal" role="dialog" aria-modal="true"><div className="library-details"><h3>Delete {pendingDelete.displayName}?</h3><p>This removes the character from your local Re:Anime library. Saved scenes that use it will need a replacement.</p><div className="modal-actions"><button className="select-field" onClick={() => setPendingDelete(null)}>Cancel</button><button className="select-field danger-action" onClick={() => {
        const inUse = project.scenes.some((scene) => scene.characters.some((item) => item.characterId === pendingDelete.characterId));
        if (inUse) { setNotice("This character is used in the current project. Remove it from all scenes before deleting."); setPendingDelete(null); return; }
        void removeCharacterPackage(pendingDelete.characterId, pendingDelete.version).then(async () => { setPendingDelete(null); await reloadLibrary(); await refreshResources(); setNotice("Character deleted."); }).catch((error: unknown) => setNotice(`Delete failed: ${String(error)}`));
      }}>Delete</button></div></div></section></div>}
      {notice && <div className="library-toast" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div>}
    </aside>
  );
}
