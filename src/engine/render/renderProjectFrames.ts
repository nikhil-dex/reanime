import type { Project } from "../../types/project";
import { createRenderPlan } from "./renderPlan";
import { iterateScheduledFrames, renderProgress, type RenderProgress } from "./renderJob";
import type { DeterministicSceneRenderer } from "./DeterministicSceneRenderer";

export interface RenderProjectOptions {
  renderer: DeterministicSceneRenderer;
  onFrame: (frame: Blob, frameNumber: number) => void | Promise<void>;
  onProgress?: (progress: RenderProgress) => void;
  signal?: AbortSignal;
}

/**
 * Streams scheduled frames in deterministic output order without retaining
 * the full video in memory. Because the current project model has no animation
 * tracks, render each scene once and reuse that PNG for its frame range.
 * Replace this cache with per-frame rendering when timed animation is added.
 */
export async function renderProjectFrames(
  project: Project,
  options: RenderProjectOptions,
): Promise<{ totalFrames: number; durationSeconds: number }> {
  const plan = createRenderPlan(project);
  let completedFrames = 0;
  const sceneFrames = new Map<string, Blob>();
  options.onProgress?.(renderProgress(0, plan.totalFrames));

  try {
    await options.renderer.initialize();
    for (const scheduled of iterateScheduledFrames(project, plan)) {
      if (options.signal?.aborted) {
        throw new DOMException("Render cancelled.", "AbortError");
      }

      let frame = sceneFrames.get(scheduled.scene.id);
      if (!frame) {
        frame = await options.renderer.renderScene(scheduled.scene);
        sceneFrames.set(scheduled.scene.id, frame);
      }
      if (options.signal?.aborted) {
        throw new DOMException("Render cancelled.", "AbortError");
      }

      await options.onFrame(frame, scheduled.frame);
      completedFrames += 1;
      options.onProgress?.(renderProgress(completedFrames, plan.totalFrames));
    }
    return { totalFrames: plan.totalFrames, durationSeconds: plan.durationSeconds };
  } finally {
    sceneFrames.clear();
    options.renderer.destroy();
  }
}
