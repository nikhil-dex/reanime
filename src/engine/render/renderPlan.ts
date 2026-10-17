import type { Project, Scene } from "../types/project";

export interface SceneFrameRange {
  sceneId: string;
  sceneName: string;
  startFrame: number;
  frameCount: number;
  endFrameExclusive: number;
}

export interface RenderPlan {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  durationSeconds: number;
  scenes: SceneFrameRange[];
}

const MAX_RENDER_FRAMES = 10_000_000;

/**
 * Build a deterministic, zero-based frame schedule. Scene boundaries are
 * rounded independently to the nearest output frame; no wall-clock timing
 * or editor playback state is consulted.
 */
export function createRenderPlan(project: Pick<Project, "width" | "height" | "fps" | "scenes">): RenderPlan {
  if (!Number.isInteger(project.width) || project.width < 1 || !Number.isInteger(project.height) || project.height < 1) {
    throw new Error("Render dimensions must be positive integers.");
  }
  if (!Number.isInteger(project.fps) || project.fps < 1 || project.fps > 240) {
    throw new Error("Render FPS must be an integer between 1 and 240.");
  }
  if (!Array.isArray(project.scenes) || project.scenes.length === 0) {
    throw new Error("The project must contain at least one scene to render.");
  }

  let elapsedSeconds = 0;
  let previousEndFrame = 0;
  const scenes: SceneFrameRange[] = project.scenes.map((scene: Scene) => {
    if (!Number.isFinite(scene.duration) || scene.duration <= 0 || scene.duration > 600) {
      throw new Error(`Scene "${scene.name}" must have a duration greater than 0 and no more than 600 seconds.`);
    }
    elapsedSeconds += scene.duration;
    const endFrameExclusive = Math.round(elapsedSeconds * project.fps);
    const frameCount = endFrameExclusive - previousEndFrame;
    const range = {
      sceneId: scene.id,
      sceneName: scene.name,
      startFrame: previousEndFrame,
      frameCount,
      endFrameExclusive,
    };
    previousEndFrame = endFrameExclusive;
    return range;
  });

  if (previousEndFrame < 1 || previousEndFrame > MAX_RENDER_FRAMES) {
    throw new Error(`Render would contain ${previousEndFrame.toLocaleString()} frames; the supported limit is ${MAX_RENDER_FRAMES.toLocaleString()}.`);
  }
  if (scenes.some((scene) => scene.frameCount < 1)) {
    throw new Error("Every scene must occupy at least one output frame at the selected FPS.");
  }

  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    totalFrames: previousEndFrame,
    durationSeconds: previousEndFrame / project.fps,
    scenes,
  };
}
