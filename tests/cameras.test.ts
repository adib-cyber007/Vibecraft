import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createScene, type Camera, type CameraKeyframe } from '../src/model';
import { cameraAtTime, getSceneAtTime, projectDuration, sceneCameraAtTime, sceneDuration, sceneStart, sortedCameraKeyframes } from '../src/engine/timeline';
import { renderProject } from '../src/engine/render';
import { parseProject } from '../src/validation';

const origin: Camera = { x: 960, y: 540, zoom: 1 };
const destination: Camera = { x: 1960, y: 740, zoom: 2 };
function frame(id: string, camera = origin, overrides: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return { id, name: id, start: 0, duration: 0, pause: 0, camera: { ...camera }, easing: 'linear', locked: false, pinned: false, ...overrides };
}

test('old version 1 projects retain their camera fallback and smooth scene pan', () => {
  const project = createProject({ scenes: [createScene(1920, 1080, { duration: 3, camera: origin }), createScene(1920, 1080, { duration: 3, camera: destination, transition: 'pan', transitionDuration: 2 })] });
  assert.equal(parseProject(project).scenes[0].cameras, undefined);
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 0)!), origin);
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 3)!), origin);
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 4)!), { x: 1460, y: 640, zoom: 1.5 });
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 5)!), destination);
});

test('a camera move starts exactly on its timeline point and holds after arrival', () => {
  const scene = createScene(1920, 1080, { camera: { x: -100, y: -100, zoom: 5 }, cameras: [frame('initial'), frame('destination', destination, { start: 2, duration: 4, pause: 1 })] });
  assert.deepEqual(sceneCameraAtTime(scene, 1.999), origin);
  assert.deepEqual(sceneCameraAtTime(scene, 2), origin);
  assert.deepEqual(sceneCameraAtTime(scene, 4), { x: 1460, y: 640, zoom: 1.5 });
  assert.deepEqual(sceneCameraAtTime(scene, 6), destination);
  assert.deepEqual(sceneCameraAtTime(scene, 200), destination);
  assert.deepEqual(sceneCameraAtTime(scene, Number.NaN), origin);
});

test('ease out, instant movement, and zero duration have exact boundary states', () => {
  const scene = createScene(1920, 1080, { cameras: [frame('initial'), frame('destination', destination, { start: 2, duration: 4, easing: 'ease-out' })] });
  assert.deepEqual(sceneCameraAtTime(scene, 4), { x: 1835, y: 715, zoom: 1.875 });
  scene.cameras![1].duration = 0;
  assert.deepEqual(sceneCameraAtTime(scene, 1.999), origin);
  assert.deepEqual(sceneCameraAtTime(scene, 2), destination);
  scene.cameras![1].duration = 4;
  scene.cameras![1].easing = 'none';
  assert.deepEqual(sceneCameraAtTime(scene, 1.999), origin);
  assert.deepEqual(sceneCameraAtTime(scene, 2), destination);
});

test('overlapping moves continue from the in-flight view, including an incoming scene pan', () => {
  const third = { x: 2960, y: 940, zoom: 3 };
  const scene = createScene(1920, 1080, { cameras: [frame('initial'), frame('destination', destination, { start: 2, duration: 4 }), frame('third', third, { start: 4, duration: 2 })] });
  assert.deepEqual(sceneCameraAtTime(scene, 4), { x: 1460, y: 640, zoom: 1.5 });
  assert.deepEqual(sceneCameraAtTime(scene, 5), { x: 2210, y: 790, zoom: 2.25 });
  assert.deepEqual(sceneCameraAtTime(scene, 6), third);
  const next = createScene(1920, 1080, { transition: 'pan', transitionDuration: 4, cameras: [frame('next-initial', destination), frame('next-move', third, { start: 2, duration: 2 })] });
  const project = createProject({ scenes: [createScene(1920, 1080, { duration: 3, camera: origin }), next] });
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 5)!), { x: 1460, y: 640, zoom: 1.5 });
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 6)!), { x: 2210, y: 790, zoom: 2.25 });
});

test('camera order is stable, does not mutate storage, and the later equal-time destination wins', () => {
  const scene = createScene(1920, 1080, { cameras: [frame('initial'), frame('late', destination, { start: 5 }), frame('early', { x: 100, y: 200, zoom: 0.5 }, { start: 2 }), frame('same-time', { x: 300, y: 400, zoom: 3 }, { start: 2 })] });
  assert.deepEqual(sortedCameraKeyframes(scene).map(item => item.id), ['initial', 'early', 'same-time', 'late']);
  assert.deepEqual(scene.cameras!.map(item => item.id), ['initial', 'late', 'early', 'same-time']);
  assert.deepEqual(sceneCameraAtTime(scene, 2), { x: 300, y: 400, zoom: 3 });
});

test('camera travel and pause extend the scene and all following scene offsets', () => {
  const scene = createScene(1920, 1080, { duration: 2, cameras: [frame('initial'), frame('last', destination, { start: 4, duration: 2, pause: 3 })] });
  const next = createScene(1920, 1080, { duration: 2 });
  const project = createProject({ scenes: [scene, next] });
  assert.equal(sceneDuration(scene), 9);
  assert.equal(sceneStart(project, next.id), 9);
  assert.equal(projectDuration(project), 11);
  assert.equal(getSceneAtTime(project, 8.999)!.scene.id, scene.id);
  assert.equal(getSceneAtTime(project, 9)!.scene.id, next.id);
  assert.deepEqual(sceneCameraAtTime(scene, 9), destination);
});

test('a following scene pan starts from the preceding camera destination', () => {
  const scene = createScene(1920, 1080, { duration: 4, camera: origin, cameras: [frame('initial'), frame('last', destination, { start: 1, duration: 1 })] });
  const next = createScene(1920, 1080, { transition: 'pan', transitionDuration: 2, camera: { x: 3000, y: 1000, zoom: 3 } });
  const project = createProject({ scenes: [scene, next] });
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 4)!), destination);
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 5)!), { x: 2480, y: 870, zoom: 2.5 });
});

test('the frame renderer shares animated camera sampling while static editing keeps its selected view', () => {
  const scene = createScene(1920, 1080, { camera: { x: 300, y: 400, zoom: 3 }, cameras: [frame('initial'), frame('last', destination, { start: 2, duration: 4 })] });
  const project = createProject({ scenes: [scene] });
  const translations: number[][] = [], scales: number[][] = [];
  const context = { save() {}, restore() {}, setTransform() {}, clearRect() {}, fillRect() {}, globalAlpha: 1, fillStyle: '', translate(x: number, y: number) { translations.push([x, y]); }, scale(x: number, y: number) { scales.push([x, y]); } } as unknown as CanvasRenderingContext2D;
  const options = { width: 1920, height: 1080, images: new Map<string, CanvasImageSource>() };
  renderProject(context, project, 4, options);
  const sample = cameraAtTime(project, getSceneAtTime(project, 4)!);
  assert.deepEqual(translations.at(-1), [-sample.x, -sample.y]);
  assert.deepEqual(scales.at(-1), [sample.zoom, sample.zoom]);
  renderProject(context, project, 4, { ...options, preview: true });
  assert.deepEqual(translations.at(-1), [-300, -400]);
  assert.deepEqual(scales.at(-1), [3, 3]);
});

test('camera metadata survives project save/import without changing version 1', () => {
  const scene = createScene(1920, 1080, { cameras: [frame('initial'), frame('last', destination, { start: 2, duration: 1, pause: 2, easing: 'ease-out', locked: true, pinned: true })] });
  const project = createProject({ scenes: [scene] });
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
});

test('camera import rejects invalid positions, missing starts, excessive resources, and duplicate identities', () => {
  const project = createProject({ scenes: [createScene(1920, 1080, { cameras: [frame('initial'), frame('last', destination, { start: 2 })] })] });
  for (const property of ['x', 'y', 'zoom'] as const) {
    const invalid = structuredClone(project);
    invalid.scenes[0].cameras![1].camera[property] = Number.POSITIVE_INFINITY;
    assert.throws(() => parseProject(invalid));
  }
  const invalidStart = structuredClone(project);
  invalidStart.scenes[0].cameras![0].start = 1;
  assert.throws(() => parseProject(invalidStart), /starting camera/);
  const duplicate = structuredClone(project);
  duplicate.scenes[0].cameras![1].id = duplicate.scenes[0].id;
  assert.throws(() => parseProject(duplicate), /Duplicate/);
  const empty = structuredClone(project);
  empty.scenes[0].cameras = [];
  assert.throws(() => parseProject(empty));
  const excessive = structuredClone(project);
  excessive.scenes[0].cameras = Array.from({ length: 101 }, (_, index) => frame(`camera-${index}`));
  assert.throws(() => parseProject(excessive));
  const tooLong = structuredClone(project);
  Object.assign(tooLong.scenes[0].cameras![1], { start: 599, duration: 2 });
  assert.throws(() => parseProject(tooLong), /10 minute/);
});
