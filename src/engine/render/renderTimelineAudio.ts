import type { Project, TimelineClip } from "../../types/project";
import { resourceRegistry } from "../../data/resourceRegistry";
import { createRenderPlan } from "./renderPlan";

const SAMPLE_RATE = 44_100;

function audioUrl(resourceId: string): string | undefined {
  return resourceRegistry.voices[resourceId]
    ?? resourceRegistry.bgm[resourceId]
    ?? resourceRegistry.sfx[resourceId];
}

function clipsWithOffsets(project: Project): Array<{ clip: TimelineClip; offset: number }> {
  const result: Array<{ clip: TimelineClip; offset: number }> = [];
  let offset = 0;
  for (const scene of project.scenes) {
    for (const track of scene.tracks ?? []) {
      if (track.kind !== "audio") continue;
      for (const clip of track.clips ?? []) {
        if (!clip.resourceId || !Number.isFinite(clip.start) || !Number.isFinite(clip.duration)
          || clip.start < 0 || clip.duration <= 0) continue;
        result.push({ clip, offset });
      }
    }
    offset += scene.duration;
  }
  return result;
}

function encodePcm16Wav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function renderTimelineAudio(project: Project): Promise<Blob | null> {
  const clips = clipsWithOffsets(project);
  if (!clips.length) return null;

  const plan = createRenderPlan(project);
  const duration = plan.durationSeconds;
  const context = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const decoded = new Map<string, AudioBuffer>();

  for (const { clip } of clips) {
    const id = clip.resourceId!;
    const url = audioUrl(id);
    if (!url) throw new Error(`Audio resource '${id}' is not registered in voices, BGM, or SFX.`);
    if (!decoded.has(id)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load audio resource '${id}' (${response.status}).`);
      decoded.set(id, await context.decodeAudioData(await response.arrayBuffer()));
    }
  }

  for (const { clip, offset } of clips) {
    const sourceBuffer = decoded.get(clip.resourceId!);
    if (!sourceBuffer) continue;
    const source = context.createBufferSource();
    source.buffer = sourceBuffer;
    const gain = context.createGain();
    const rawVolume = clip.properties?.volume;
    gain.gain.value = typeof rawVolume === "number" ? Math.max(0, Math.min(2, rawVolume)) : 1;
    source.connect(gain);
    gain.connect(context.destination);
    const start = offset + clip.start;
    if (start >= duration) continue;
    const available = Math.min(clip.duration, duration - start, sourceBuffer.duration);
    if (available <= 0) continue;
    source.start(start, 0, available);
  }

  return encodePcm16Wav(await context.startRendering());
}
