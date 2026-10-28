/** Project format owned by Vibecraft. Coordinates are canvas units, elements use top-left origins. */
export type Entrance = 'draw' | 'fade' | 'move' | 'pop' | 'none';
export type ExitStyle = 'none' | 'fade' | 'erase' | 'move';
export type Emphasis = 'none' | 'pulse' | 'wiggle';
export type Hand = 'pen' | 'marker' | 'none';

export interface Animation {
  start: number;
  draw: number;
  hold: number;
  exit: number;
  entrance: Entrance;
  exitStyle: ExitStyle;
  emphasis: Emphasis;
  hand: Hand;
  handColor: string;
}

/** Paths use a 100 x 100 viewBox. All paths are original or supplied by the user. */
export interface VectorPath {
  d: string;
  fill?: string;
  stroke?: string;
  /** Imported SVG stroke width, normalized against the source viewport width. */
  strokeWidth?: number;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'bevel' | 'miter' | 'round';
  fillRule?: 'nonzero' | 'evenodd';
}
export interface SceneElement {
  id: string;
  type: 'text' | 'vector' | 'image' | 'shape' | 'chart';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  color: string;
  fill: string;
  strokeWidth: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  paths?: VectorPath[];
  src?: string;
  shape?: 'rectangle' | 'ellipse' | 'line' | 'arrow';
  chartValues?: number[];
  animation: Animation;
}

export interface Camera { x: number; y: number; zoom: number }
/** A scene-local camera destination. The first frame is always the starting view at time zero. */
export interface CameraKeyframe {
  id: string;
  name: string;
  start: number;
  duration: number;
  pause: number;
  camera: Camera;
  easing: 'none' | 'linear' | 'ease-out';
  locked: boolean;
  pinned: boolean;
}
export interface Scene {
  id: string;
  name: string;
  background: string;
  duration: number;
  transition: 'cut' | 'fade' | 'pan';
  transitionDuration: number;
  camera: Camera;
  /** Optional for backward compatibility with original version 1 projects. */
  cameras?: CameraKeyframe[];
  elements: SceneElement[];
}

export interface AudioTrack {
  id: string;
  name: string;
  src: string;
  kind: 'music' | 'voice';
  start: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  sceneId?: string;
}

export interface Project {
  version: 1;
  id: string;
  title: string;
  width: number;
  height: number;
  mode: 'scenes' | 'roaming';
  scenes: Scene[];
  audio: AudioTrack[];
  fonts?: { family: string; src: string }[];
  script?: string;
  createdAt: string;
  updatedAt: string;
}

export function makeId(): string { return crypto.randomUUID(); }
export function defaultAnimation(): Animation {
  return { start: 0, draw: 2, hold: 1, exit: 0, entrance: 'draw', exitStyle: 'none', emphasis: 'none', hand: 'pen', handColor: '#deb38e' };
}
export function createElement(type: SceneElement['type'], overrides: Partial<SceneElement> = {}): SceneElement {
  return { id: makeId(), type, name: type === 'text' ? 'Your next big idea' : type[0].toUpperCase() + type.slice(1), x: 760, y: 340, width: 400, height: 400, rotation: 0, opacity: 1, locked: false, hidden: false, color: '#25364a', fill: 'transparent', strokeWidth: 2.2, animation: defaultAnimation(), ...(type === 'text' ? { text: 'Your next big idea', fontFamily: 'Trebuchet MS', fontSize: 64, fontWeight: 700, align: 'center' as const, width: 800, height: 180, x: 560 } : {}), ...overrides };
}
export function createScene(width = 1920, height = 1080, overrides: Partial<Scene> = {}): Scene {
  return { id: makeId(), name: 'A new scene', background: '#ffffff', duration: 8, transition: 'fade', transitionDuration: 0.5, camera: { x: width / 2, y: height / 2, zoom: 1 }, elements: [], ...overrides };
}
export function createProject(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  return { version: 1, id: makeId(), title: 'Untitled story', width: 1920, height: 1080, mode: 'scenes', scenes: [createScene()], audio: [], createdAt: now, updatedAt: now, ...overrides };
}
