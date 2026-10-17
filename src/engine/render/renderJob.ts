import type { Project, Scene } from "../../types/project";
import { createRenderPlan, type RenderPlan, type SceneFrameRange } from "./renderPlan";

export interface ScheduledFrame {
  /** Zero-based frame number in the final output. */
  frame: number;
  /** Zero-based frame number within this scene. */
  sceneFrame: number;
  /** Exact timestamp in seconds on the output frame grid. */
  timestampSeconds: number;
  scene: Scene;
  range: SceneFrameRange;
}

export interface RenderProgress {
  completedFrames: number;
  totalFrames: number;
  progress: number;
}

/**
 * Walks the render schedule in output order. The iterator is independent of
 * requestAnimationFrame, setInterval, and the editor's interactive playhead.
 * A consumer can render the same project repeatedly and receive the same
 * frame/scene mapping every time.
 */
export function* iterateScheduledFrames(
  project: Pick<Project, "width" | "height" | "fps" | "scenes">,
  plan: RenderPlan = createRenderPlan(project),
): Generator<ScheduledFrame> {
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  for (const range of plan.scenes) {
    const scene = scenesById.get(range.sceneId);
    if (!scene) {
      throw new Error(`Render plan references missing scene '${range.sceneId}'.`);
    }
    for (let sceneFrame = 0; sceneFrame < range.frameCount; sceneFrame += 1) {
      const frame = range.startFrame + sceneFrame;
      yield {
        frame,
        sceneFrame,
        timestampSeconds: frame / plan.fps,
        scene,
        range,
      };
    }
  }
}

export function renderProgress(completedFrames: number, totalFrames: number): RenderProgress {
  if (!Number.isInteger(totalFrames) || totalFrames < 1) {
    throw new Error("Total render frames must be a positive integer.");
  }
  if (!Number.isInteger(completedFrames) || completedFrames < 0 || completedFrames > totalFrames) {
    throw new Error("Completed render frames must be between zero and total frames.");
  }
  return {
    completedFrames,
    totalFrames,
    progress: completedFrames / totalFrames,
  };
}
