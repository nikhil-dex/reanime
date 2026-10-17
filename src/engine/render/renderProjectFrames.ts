import type { Project } from "../../types/project";
import { evaluateSceneAtTime } from "../timeline/evaluateSceneAtTime";
import { createRenderPlan } from "./renderPlan";
import { iterateScheduledFrames, renderProgress, type RenderProgress } from "./renderJob";
import type { DeterministicSceneRenderer } from "./DeterministicSceneRenderer";

export interface RenderProjectOptions {
  renderer: DeterministicSceneRenderer;
  onFrame: (frame: Blob, frameNumber: number) => void | Promise<void>;
  onProgress?: (progress: RenderProgress) => void;
  signal?: AbortSignal;
}

/** Renders every frame from the same deterministic timeline evaluator used by preview tooling. */
export async function renderProjectFrames(
  project: Project,
  options: RenderProjectOptions,
): Promise<{ totalFrames: number; durationSeconds: number }> {
  const plan = createRenderPlan(project);
  let completedFrames = 0;
  const staticSceneFrames = new Map<string, Blob>();
  options.onProgress?.(renderProgress(0, plan.totalFrames));

  try {
    await options.renderer.initialize();
    for (const scheduled of iterateScheduledFrames(project, plan)) {
      if (options.signal?.aborted) {
        throw new DOMException("Render cancelled.", "AbortError");
      }

      let frame: Blob;
      if (!scheduled.scene.tracks?.length) {
        const cached = staticSceneFrames.get(scheduled.scene.id);
        if (cached) frame = cached;
        else {
          const evaluated = evaluateSceneAtTime(scheduled.scene, scheduled.sceneFrame / plan.fps);
          frame = await options.renderer.renderScene(evaluated.scene, evaluated.activeEffects);
          staticSceneFrames.set(scheduled.scene.id, frame);
        }
      } else {
        const evaluated = evaluateSceneAtTime(scheduled.scene, scheduled.sceneFrame / plan.fps);
        frame = await options.renderer.renderScene(evaluated.scene, evaluated.activeEffects);
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
    staticSceneFrames.clear();
    options.renderer.destroy();
  }
}
