import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../types/project";
import { DeterministicSceneRenderer } from "./DeterministicSceneRenderer";
import { renderProjectFrames } from "./renderProjectFrames";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read rendered PNG frame."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Rendered frame could not be encoded."));
        return;
      }
      const separator = reader.result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Rendered frame has an invalid data URL."));
        return;
      }
      resolve(reader.result.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export interface ExportProgress {
  completedFrames: number;
  totalFrames: number;
  progress: number;
}

export async function exportProjectToMp4(
  project: Project,
  onProgress?: (progress: ExportProgress) => void,
): Promise<string | null> {
  const suggestedName = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "re-anime"}.mp4`;
  const outputPath = await save({
    title: "Export Re:Anime video",
    defaultPath: suggestedName,
    filters: [{ name: "MP4 video", extensions: ["mp4"] }],
  });
  if (!outputPath) return null;
  if (!outputPath.toLowerCase().endsWith(".mp4")) {
    throw new Error("Choose an output filename ending in .mp4.");
  }

  const sessionId = await invoke<string>("begin_video_render", { fps: project.fps });
  let sessionFinished = false;
  try {
    const renderer = new DeterministicSceneRenderer({
      width: project.width,
      height: project.height,
    });
    const result = await renderProjectFrames(project, {
      renderer,
      onProgress,
      onFrame: async (blob, frameNumber) => {
        const pngBase64 = await blobToBase64(blob);
        await invoke("write_video_frame", {
          sessionId,
          frameIndex: frameNumber,
          pngBase64,
        });
      },
    });
    const savedPath = await invoke<string>("finish_video_render", {
      sessionId,
      outputPath,
    });
    sessionFinished = true;
    onProgress?.({
      completedFrames: result.totalFrames,
      totalFrames: result.totalFrames,
      progress: 1,
    });
    return savedPath;
  } finally {
    if (!sessionFinished) {
      await invoke("cancel_video_render", { sessionId }).catch(() => undefined);
    }
  }
}
