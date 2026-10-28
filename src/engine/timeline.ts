import type { Animation, AudioTrack, Camera, CameraKeyframe, Project, Scene, SceneElement } from '../model';

export const clamp = (value: number, low = 0, high = 1): number => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
export const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;
export const easeInOut = (progress: number): number => { const p = clamp(progress); return p * p * (3 - 2 * p); };
const seconds = (n: number): number => Math.max(0, Number.isFinite(n) ? n : 0);

export function elementDuration(element: SceneElement | Animation): number {
  const a = 'animation' in element ? element.animation : element;
  return seconds(a.draw) + seconds(a.hold) + seconds(a.exit);
}
export function elementEnd(element: SceneElement): number { return seconds(element.animation.start) + elementDuration(element); }
export function cameraKeyframeEnd(frame: CameraKeyframe): number { return seconds(frame.start) + seconds(frame.duration) + seconds(frame.pause); }
/** The starting frame keeps its identity; equal-time destinations retain their array order. */
export function sortedCameraKeyframes(scene: Scene): CameraKeyframe[] {
  if (!scene.cameras?.length) return [];
  return [scene.cameras[0], ...scene.cameras.slice(1).sort((a, b) => a.start - b.start)];
}
export function sceneDuration(scene: Scene): number {
  return Math.max(0.1, seconds(scene.duration), ...scene.elements.filter(e => !e.hidden).map(elementEnd), ...(scene.cameras ?? []).map(cameraKeyframeEnd));
}
export function projectDuration(project: Project): number { return project.scenes.reduce((sum, scene) => sum + sceneDuration(scene), 0); }
export interface SceneTime { scene: Scene; sceneIndex: number; localTime: number; start: number; end: number; duration: number }
/** Scene intervals are half-open; the exact project end returns the last scene's final frame. */
export function getSceneAtTime(project: Project, time: number): SceneTime | null {
  if (!project.scenes.length) return null;
  const t = Math.max(0, Number.isFinite(time) ? time : 0);
  let start = 0;
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex++) {
    const scene = project.scenes[sceneIndex], duration = sceneDuration(scene), end = start + duration;
    if (t < end || sceneIndex === project.scenes.length - 1) return { scene, sceneIndex, localTime: clamp(t - start, 0, duration), start, end, duration };
    start = end;
  }
  return null;
}
export function sceneStart(project: Project, sceneId: string): number {
  let t = 0;
  for (const scene of project.scenes) { if (scene.id === sceneId) return t; t += sceneDuration(scene); }
  return 0;
}
export interface ElementState { visible: boolean; drawProgress: number; opacity: number; translateX: number; translateY: number; scale: number; rotation: number; exiting: boolean }
export function elementState(element: SceneElement, localTime: number): ElementState {
  const a = element.animation, elapsed = localTime - seconds(a.start);
  const result: ElementState = { visible: !element.hidden && elapsed >= 0, drawProgress: 1, opacity: clamp(element.opacity), translateX: 0, translateY: 0, scale: 1, rotation: 0, exiting: false };
  if (!result.visible) return result;
  const draw = seconds(a.draw), hold = seconds(a.hold), exit = seconds(a.exit);
  const progress = draw === 0 ? 1 : clamp(elapsed / draw), eased = easeInOut(progress);
  if (a.entrance === 'draw') result.drawProgress = progress;
  if (a.entrance === 'fade') result.opacity *= eased;
  if (a.entrance === 'move') { result.translateX = (1 - eased) * -180; result.opacity *= clamp(progress * 4); }
  if (a.entrance === 'pop') { result.scale = 0.2 + eased * 0.8 + Math.sin(progress * Math.PI) * 0.18; result.opacity *= clamp(progress * 4); }
  if (elapsed >= draw && a.emphasis !== 'none') {
    const pulseTime = elapsed - draw;
    if (a.emphasis === 'pulse') result.scale = 1 + Math.sin(pulseTime * Math.PI * 2) * 0.035;
    if (a.emphasis === 'wiggle') result.rotation = Math.sin(pulseTime * Math.PI * 3) * 3;
  }
  const exitElapsed = elapsed - draw - hold;
  if (a.exitStyle !== 'none' && exitElapsed >= 0) {
    result.exiting = true;
    const p = exit === 0 ? 1 : clamp(exitElapsed / exit), smooth = easeInOut(p);
    if (a.exitStyle === 'fade') result.opacity *= 1 - smooth;
    if (a.exitStyle === 'erase') result.drawProgress = 1 - p;
    if (a.exitStyle === 'move') { result.translateX = smooth * 220; result.opacity *= 1 - smooth; }
    if (p >= 1) result.visible = false;
  }
  return result;
}
export function interpolateCamera(from: Camera, to: Camera, progress: number): Camera {
  const p = easeInOut(progress);
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), zoom: Math.max(0.05, lerp(from.zoom, to.zoom, p)) };
}
type CameraMotion = { from: Camera; to: Camera; start: number; duration: number; easing: CameraKeyframe['easing'] | 'smooth' };
function sampleCameraMotion(motion: CameraMotion, time: number): Camera {
  const progress = motion.duration <= 0 || motion.easing === 'none' ? 1 : clamp((time - motion.start) / motion.duration);
  const p = motion.easing === 'ease-out' ? 1 - (1 - progress) ** 3 : motion.easing === 'smooth' ? easeInOut(progress) : progress;
  return { x: lerp(motion.from.x, motion.to.x, p), y: lerp(motion.from.y, motion.to.y, p), zoom: Math.max(0.05, lerp(motion.from.zoom, motion.to.zoom, p)) };
}
function sampleSceneCamera(scene: Scene, localTime: number, incoming?: { from: Camera; duration: number }): Camera {
  const frames = sortedCameraKeyframes(scene), first = frames[0]?.camera ?? scene.camera;
  let motion: CameraMotion = { from: incoming?.from ?? first, to: first, start: 0, duration: incoming?.duration ?? 0, easing: 'smooth' };
  const time = seconds(localTime);
  for (const frame of frames.slice(1)) {
    if (time < frame.start) break;
    // An overlapping destination interrupts the current move without a visual jump.
    motion = { from: sampleCameraMotion(motion, frame.start), to: frame.camera, start: frame.start, duration: seconds(frame.duration), easing: frame.easing };
  }
  return sampleCameraMotion(motion, time);
}
/** Scene camera sampler used for held final views and destinations independent of scene transitions. */
export function sceneCameraAtTime(scene: Scene, localTime: number): Camera { return sampleSceneCamera(scene, localTime); }
export function cameraAtTime(project: Project, state: SceneTime): Camera {
  const { scene, sceneIndex, localTime } = state;
  const pan = scene.transition === 'pan' && sceneIndex > 0 && scene.transitionDuration > 0;
  if (!pan) return sceneCameraAtTime(scene, localTime);
  const previous = project.scenes[sceneIndex - 1], from = sceneCameraAtTime(previous, sceneDuration(previous));
  return sampleSceneCamera(scene, localTime, { from, duration: scene.transitionDuration });
}
export function audioTrackDuration(track: AudioTrack): number { return Math.max(0, track.trimEnd - track.trimStart); }
export function audioTrackStart(project: Project, track: AudioTrack): number { return seconds(track.start) + (track.sceneId ? sceneStart(project, track.sceneId) : 0); }
export function audioVolumeAtTime(project: Project, track: AudioTrack, time: number): number {
  const elapsed = time - audioTrackStart(project, track), duration = audioTrackDuration(track);
  if (elapsed < 0 || elapsed >= duration) return 0;
  const fadeIn = seconds(track.fadeIn), fadeOut = seconds(track.fadeOut);
  return clamp(track.volume) * (fadeIn ? clamp(elapsed / fadeIn) : 1) * (fadeOut ? clamp((duration - elapsed) / fadeOut) : 1);
}
