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
 * Renders project frames in their deterministic output order. Frames are
 * handed to the caller one at a time instead of accumulated in memory, so an
 * encoder can consume them incrementally. Animation tracks are not yet part
 * of the project model; each scene currently renders its saved static state.
 */
export async function renderProjectFrames(
  project: Project,
  options: RenderProjectOptions,
): Promise<{ totalFrames: number; durationSeconds: number }> {
  const plan = createRenderPlan(project);
  let completedFrames = 0;
  options.onProgress?.(renderProgress(0, plan.totalFrames));

  try {
    await options.renderer.initialize();
    for (const scheduled of iterateScheduledFrames(project, plan)) {
      if (options.signal?.aborted) {
        throw new DOMException("Render cancelled.", "AbortError");
      }
      const frame = await options.renderer.renderScene(scheduled.scene);
      if (options.signal?.aborted) {
        throw new DOMException("Render cancelled.", "AbortError");
      }
      await options.onFrame(frame, scheduled.frame);
      completedFrames += 1;
      options.onProgress?.(renderProgress(completedFrames, plan.totalFrames));
    }
    return { totalFrames: plan.totalFrames, durationSeconds: plan.durationSeconds };
  } finally {
    options.renderer.destroy();
  }
}
