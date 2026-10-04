import { AssetSidebar } from "./components/editor/AssetSidebar";
import { PreviewWorkspace } from "./components/editor/PreviewWorkspace";
import { PropertiesPanel } from "./components/editor/PropertiesPanel";
import { Icon } from "./components/common/Icon";
import { Timeline } from "./components/timeline/Timeline";
import { useEditorStore } from "./store/editorStore";

function downloadProject(project: ReturnType<typeof useEditorStore.getState>["project"]) {
  const content = JSON.stringify(project, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "project"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const project = useEditorStore((state) => state.project);
  const updateProjectName = useEditorStore((state) => state.updateProjectName);
  const resetProject = useEditorStore((state) => state.resetProject);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const setPlaying = useEditorStore((state) => state.setPlaying);

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
          <button className="text-action" onClick={resetProject}><Icon name="plus" /> New project</button>
          <button className="text-action save-action" onClick={() => downloadProject(project)}><Icon name="save" /> Save</button>
          <span className="action-divider" />
          <button className="preview-button" onClick={() => setPlaying(!isPlaying)}><Icon name={isPlaying ? "pause" : "play"} /> Preview</button>
          <button className="render-button" disabled title="Video rendering is not included in v0.1">Render video <span>↗</span></button>
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
      <footer className="statusbar">
        <span><span className="status-dot" /> All changes local</span>
        <span>1920 × 1080 <i>·</i> 30 FPS</span>
        <span>Re:Anime <b>v0.1 foundation</b></span>
      </footer>
    </main>
  );
}
