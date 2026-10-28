import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createProject, createScene } from '../src/model';
import { assets, assetById } from '../src/assets';
import { audioTrackStart, audioVolumeAtTime, cameraAtTime, elementDuration, elementState, getSceneAtTime, interpolateCamera, projectDuration, sceneDuration, sceneStart } from '../src/engine/timeline';

test('story duration includes delayed drawings and never truncates their exits', () => {
  const element = createElement('text');
  element.animation = { ...element.animation, start: 4, draw: 3, hold: 2, exit: 1 };
  const scene = createScene(1920, 1080, { duration: 2, elements: [element] });
  assert.equal(elementDuration(element), 6);
  assert.equal(sceneDuration(scene), 10);
  element.hidden = true;
  assert.equal(sceneDuration(scene), 2);
});

test('scene selection respects half-open intervals and includes a final frame', () => {
  const a = createScene(1920, 1080, { duration: 3 }), b = createScene(1920, 1080, { duration: 5 });
  const project = createProject({ scenes: [a, b] });
  assert.equal(projectDuration(project), 8);
  assert.equal(getSceneAtTime(project, 2.999)?.scene.id, a.id);
  assert.equal(getSceneAtTime(project, 3)?.scene.id, b.id);
  assert.equal(getSceneAtTime(project, 3)?.localTime, 0);
  assert.equal(getSceneAtTime(project, 8)?.localTime, 5);
  assert.equal(getSceneAtTime(project, 999)?.localTime, 5);
  assert.equal(sceneStart(project, b.id), 3);
  assert.equal(getSceneAtTime({ ...project, scenes: [] }, 0), null);
});

test('a drawing starts precisely at its start and reaches its complete stroke', () => {
  const element = createElement('vector');
  element.animation = { ...element.animation, start: 2, draw: 4, hold: 1 };
  assert.equal(elementState(element, 1.999).visible, false);
  assert.equal(elementState(element, 2).visible, true);
  assert.equal(elementState(element, 2).drawProgress, 0);
  assert.equal(elementState(element, 4).drawProgress, 0.5);
  assert.equal(elementState(element, 6).drawProgress, 1);
  assert.equal(elementState(element, 50).visible, true);
});

test('exit timing covers draw, hold, and complete disappearance', () => {
  const element = createElement('vector');
  element.animation = { ...element.animation, draw: 2, hold: 3, exit: 2, exitStyle: 'erase' };
  assert.equal(elementState(element, 4.99).exiting, false);
  assert.equal(elementState(element, 5).drawProgress, 1);
  assert.equal(elementState(element, 6).drawProgress, 0.5);
  assert.equal(elementState(element, 7).visible, false);
  assert.equal(elementState(element, 8).visible, false);
});

test('zero-time entrances and exits have defined states, without division by zero', () => {
  const element = createElement('text');
  element.animation = { ...element.animation, draw: 0, hold: 1, exit: 0, exitStyle: 'fade' };
  assert.equal(elementState(element, 0).drawProgress, 1);
  assert.equal(elementState(element, 0).opacity, 1);
  assert.equal(elementState(element, 0.9).visible, true);
  assert.equal(elementState(element, 1).visible, false);
});

test('fades preserve user opacity and finish cleanly', () => {
  const element = createElement('shape', { opacity: 0.6 });
  element.animation = { ...element.animation, draw: 2, entrance: 'fade', hold: 2, exit: 2, exitStyle: 'fade' };
  assert.equal(elementState(element, 0).opacity, 0);
  assert.equal(elementState(element, 1).opacity, 0.3);
  assert.equal(elementState(element, 2).opacity, 0.6);
  assert.equal(elementState(element, 5).opacity, 0.3);
  assert.equal(elementState(element, 6).opacity, 0);
});

test('hidden elements never appear in animated playback', () => {
  const element = createElement('vector', { hidden: true });
  assert.equal(elementState(element, 20).visible, false);
});

test('camera pans are smooth, bounded, and use the previous camera', () => {
  const from = { x: 960, y: 540, zoom: 1 }, to = { x: 1300, y: 250, zoom: 2 };
  assert.deepEqual(interpolateCamera(from, to, -1), from);
  assert.deepEqual(interpolateCamera(from, to, 2), to);
  assert.deepEqual(interpolateCamera(from, to, 0.5), { x: 1130, y: 395, zoom: 1.5 });
  const project = createProject({ scenes: [createScene(1920, 1080, { duration: 3, camera: from }), createScene(1920, 1080, { duration: 3, transition: 'pan', transitionDuration: 2, camera: to })] });
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 3)!), from);
  assert.deepEqual(cameraAtTime(project, getSceneAtTime(project, 5)!), to);
});

test('audio is aligned to scene start and fades at the trimmed boundaries', () => {
  const project = createProject({ scenes: [createScene(1920, 1080, { duration: 4 }), createScene(1920, 1080, { duration: 6 })] });
  const track = { id: 'voice', name: 'Narration', src: 'data:audio/wav;base64,', kind: 'voice' as const, start: 1, trimStart: 2, trimEnd: 8, volume: 0.8, fadeIn: 1, fadeOut: 2, sceneId: project.scenes[1].id };
  assert.equal(audioTrackStart(project, track), 5);
  assert.equal(audioVolumeAtTime(project, track, 4), 0);
  assert.equal(audioVolumeAtTime(project, track, 5), 0);
  assert.equal(audioVolumeAtTime(project, track, 5.5), 0.4);
  assert.equal(audioVolumeAtTime(project, track, 7), 0.8);
  assert.equal(audioVolumeAtTime(project, track, 10), 0.4);
  assert.equal(audioVolumeAtTime(project, track, 11), 0);
});

test('the original catalog is complete, unique, and portable', () => {
  assert.ok(assets.length >= 30);
  assert.equal(new Set(assets.map(asset => asset.id)).size, assets.length);
  for (const asset of assets) {
    assert.equal(assetById[asset.id], asset);
    assert.ok(asset.paths.length > 0);
    assert.ok(asset.paths.every(path => path.d.startsWith('M')));
  }
});
