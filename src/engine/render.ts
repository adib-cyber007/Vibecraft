import { svgPathProperties } from 'svg-path-properties';
import svgpath from 'svgpath';
import type { Camera, Project, Scene, SceneElement, VectorPath } from '../model';
import { cameraAtTime, clamp, elementState, getSceneAtTime, sceneCameraAtTime, sceneDuration } from './timeline';

export interface RenderOptions {
  width: number;
  height: number;
  images: Map<string, CanvasImageSource>;
  /** Static editing canvas: all visible elements fully rendered, exact scene camera, no hands. */
  preview?: boolean;
}
interface PathInfo { path: Path2D; length: number; properties: InstanceType<typeof svgPathProperties> }
const pathCache = new Map<string, PathInfo>();
function pathInfo(d: string): PathInfo | null {
  const existing = pathCache.get(d);
  if (existing) return existing;
  try {
    const properties = new svgPathProperties(d), length = properties.getTotalLength();
    const result = { path: new Path2D(d), properties, length: Number.isFinite(length) ? length : 0 };
    if (pathCache.size > 4000) pathCache.clear();
    pathCache.set(d, result);
    return result;
  } catch { return null; }
}

/** Image resources must be ready before deterministic export begins. Broken images reject visibly. */
export async function prepareImages(project: Project): Promise<Map<string, CanvasImageSource>> {
  const images = new Map<string, CanvasImageSource>();
  const sources = new Set(project.scenes.flatMap(scene => scene.elements.filter(e => e.type === 'image' && e.src).map(e => e.src!)));
  await Promise.all([...sources].map(async src => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    await image.decode();
    images.set(src, image);
  }));
  return images;
}

/** A path-progress point in element-local units, useful for timeline/hand inspection. */
export function vectorPoint(paths: VectorPath[], progress: number, width: number, height: number): { x: number; y: number } | null {
  const info = expandedPaths(paths).flatMap(entry => svgpath(entry.d).scale(width / 100, height / 100).abs().toString().match(/M[^M]*/g) ?? []).map(d => pathInfo(d)).filter((entry): entry is PathInfo => entry !== null);
  const total = info.reduce((sum, entry) => sum + entry.length, 0);
  if (!total) return null;
  let remaining = clamp(progress) * total;
  for (let i = 0; i < info.length; i++) {
    if (remaining <= info[i].length || i === info.length - 1) {
      const point = info[i].properties.getPointAtLength(clamp(remaining, 0, info[i].length));
      return { x: point.x, y: point.y };
    }
    remaining -= info[i].length;
  }
  return null;
}

// Canvas dash phases restart per subpath. Splitting absolute moves makes sequential pen strokes exact.
function expandedPaths(paths: VectorPath[]): VectorPath[] {
  return paths.flatMap(entry => {
    if (entry.fill && entry.fill !== 'none' && entry.fill !== 'transparent') return [entry];
    // Relative moves depend on the preceding current point and must remain in one path.
    if (entry.d.includes('m')) return [entry];
    const pieces = entry.d.match(/M[^M]*/g);
    return pieces && pieces.length > 1 ? pieces.map(d => ({ ...entry, d })) : [entry];
  });
}

function renderVector(ctx: CanvasRenderingContext2D, element: SceneElement, progress: number, worldStroke = false): { x: number; y: number } | null {
  const entries = expandedPaths(element.paths ?? []);
  const prepared = entries.map(entry => {
    const absolute = svgpath(entry.d).scale(element.width / 100, element.height / 100).abs().toString();
    return { ...entry, info: pathInfo(absolute), strokes: (absolute.match(/M[^M]*/g) ?? []).map(d => pathInfo(d)).filter((part): part is PathInfo => !!part) };
  }).filter(entry => entry.info !== null);
  const total = prepared.reduce((sum, entry) => sum + entry.info!.length, 0);
  let remaining = total * clamp(progress), cursor: { x: number; y: number } | null = null;
  ctx.save();
  if (entries.some(entry => entry.stroke !== undefined)) { ctx.beginPath(); ctx.rect(0, 0, element.width, element.height); ctx.clip(); }
  for (const entry of prepared) {
    const info = entry.info!, visibleLength = clamp(remaining, 0, info.length);
    if (visibleLength <= 0 && progress < 1) break;
    const fraction = info.length ? visibleLength / info.length : 1;
    ctx.lineWidth = Math.max(0.01, entry.strokeWidth !== undefined ? entry.strokeWidth * element.width / 100 : worldStroke ? element.strokeWidth : element.strokeWidth * Math.min(element.width, element.height) / 100);
    ctx.strokeStyle = entry.stroke ?? element.color;
    ctx.lineCap = entry.lineCap ?? (entry.stroke !== undefined ? 'butt' : 'round');
    ctx.lineJoin = entry.lineJoin ?? (entry.stroke !== undefined ? 'miter' : 'round');
    ctx.miterLimit = entry.stroke !== undefined ? 4 : 10;
    if (fraction >= 1 && entry.fill && entry.fill !== 'none' && entry.fill !== 'transparent') { ctx.fillStyle = entry.fill === 'currentColor' ? element.color : entry.fill; ctx.fill(info.path, entry.fillRule ?? 'nonzero'); }
    const hasStroke = entry.stroke !== 'none' && entry.stroke !== 'transparent' && (entry.strokeWidth ?? 1) > 0;
    const sketchFill = !hasStroke && fraction < 1 && entry.fill && entry.fill !== 'none' && entry.fill !== 'transparent';
    if (sketchFill) {
      // A filled-only shape is sketched in its fill color, then filled; the final frame has no added border.
      ctx.strokeStyle = entry.fill!;
      ctx.lineWidth = Math.max(1, Math.min(element.width, element.height) / 100);
    }
    let strokeRemaining = visibleLength;
    for (const stroke of entry.strokes) {
      if (strokeRemaining <= 0 && progress < 1) break;
      const strokeLength = clamp(strokeRemaining, 0, stroke.length);
      if (strokeLength >= stroke.length) ctx.setLineDash([]);
      else { ctx.setLineDash([stroke.length, stroke.length + 1]); ctx.lineDashOffset = stroke.length - strokeLength; }
      if (hasStroke || sketchFill) ctx.stroke(stroke.path);
      const point = stroke.properties.getPointAtLength(strokeLength);
      cursor = { x: point.x, y: point.y };
      strokeRemaining -= stroke.length;
    }
    remaining -= info.length;
  }
  ctx.restore();
  return cursor;
}

interface TextLine { text: string; width: number; x: number; y: number }
const segmenter = typeof Intl.Segmenter !== 'undefined' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (text: string): string[] => segmenter ? [...segmenter.segment(text)].map(s => s.segment) : Array.from(text);
function textLines(ctx: CanvasRenderingContext2D, element: SceneElement): TextLine[] {
  const fontSize = Math.max(8, element.fontSize ?? 64), maxWidth = Math.max(1, element.width), lineHeight = fontSize * 1.24;
  ctx.font = `${element.fontWeight ?? 600} ${fontSize}px "${(element.fontFamily ?? 'Trebuchet MS').replaceAll('"', '')}", sans-serif`;
  const strings: string[] = [];
  for (const paragraph of (element.text ?? '').split('\n')) {
    if (!paragraph) { strings.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (ctx.measureText(line + word).width <= maxWidth) { line += word; continue; }
      if (line.trim()) { strings.push(line.trimEnd()); line = ''; }
      if (!word.trim()) continue;
      for (const char of graphemes(word)) {
        if (line && ctx.measureText(line + char).width > maxWidth) { strings.push(line); line = ''; }
        line += char;
      }
    }
    strings.push(line.trimEnd());
  }
  return strings.map((text, index) => {
    const width = ctx.measureText(text).width;
    return { text, width, x: element.align === 'left' ? 0 : element.align === 'right' ? maxWidth - width : (maxWidth - width) / 2, y: index * lineHeight };
  });
}

function renderText(ctx: CanvasRenderingContext2D, element: SceneElement, progress: number): { x: number; y: number } | null {
  ctx.save();
  const lines = textLines(ctx, element), fontSize = Math.max(8, element.fontSize ?? 64);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = element.color;
  ctx.beginPath(); ctx.rect(0, 0, element.width, element.height); ctx.clip();
  const total = lines.reduce((sum, line) => sum + line.width, 0);
  let remaining = clamp(progress) * total, cursor = null;
  for (const line of lines) {
    if (remaining <= 0 && progress < 1) break;
    const width = Math.min(line.width, Math.max(0, remaining));
    ctx.save();
    ctx.beginPath(); ctx.rect(line.x - 2, line.y - 2, progress >= 1 ? line.width + 4 : width, fontSize * 1.24 + 4); ctx.clip();
    ctx.fillText(line.text, line.x, line.y);
    ctx.restore();
    cursor = { x: line.x + width, y: line.y + fontSize * 0.6 };
    remaining -= line.width;
  }
  ctx.restore();
  return cursor;
}

function shapePaths(element: SceneElement): VectorPath[] {
  switch (element.shape) {
    case 'ellipse': return [{ d: 'M50 2 C77 2 98 23 98 50 C98 77 77 98 50 98 C23 98 2 77 2 50 C2 23 23 2 50 2 Z' }];
    case 'line': return [{ d: 'M2 50 L98 50' }];
    case 'arrow': return [{ d: 'M2 50 L96 50' }, { d: 'M73 25 L98 50 L73 75' }];
    default: return [{ d: 'M2 2 L98 2 L98 98 L2 98 Z' }];
  }
}
function renderShape(ctx: CanvasRenderingContext2D, element: SceneElement, progress: number): { x: number; y: number } | null {
  if (progress >= 1 && element.fill !== 'transparent' && element.fill !== 'none' && element.shape !== 'line' && element.shape !== 'arrow') {
    ctx.save(); ctx.scale(element.width / 100, element.height / 100); ctx.fillStyle = element.fill;
    const info = pathInfo(shapePaths(element)[0].d); if (info) ctx.fill(info.path);
    ctx.restore();
  }
  return renderVector(ctx, { ...element, paths: shapePaths(element) }, progress, true);
}

function renderChart(ctx: CanvasRenderingContext2D, element: SceneElement, progress: number): { x: number; y: number } | null {
  const values = (element.chartValues ?? [35, 55, 40, 80, 95]).map(value => Math.max(0, value));
  const max = Math.max(1, ...values), width = element.width, height = element.height, n = values.length;
  ctx.save();
  ctx.strokeStyle = element.color; ctx.lineWidth = Math.max(1, element.strokeWidth * width / 100); ctx.lineCap = 'round';
  const inheritedAlpha = ctx.globalAlpha;
  ctx.beginPath(); ctx.moveTo(0, height * (1 - Math.min(1, progress * 4))); ctx.lineTo(0, height); ctx.lineTo(width * Math.min(1, progress * 4), height); ctx.stroke();
  let cursor = { x: width * Math.min(1, progress * 4), y: height };
  for (let i = 0; i < n; i++) {
    const barProgress = clamp(progress * (n + 1) - i - 0.5), slot = width / Math.max(1, n), x = i * slot + slot * 0.22, barWidth = slot * 0.58, barHeight = values[i] / max * height * 0.88 * barProgress;
    if (barProgress <= 0) continue;
    ctx.fillStyle = element.fill !== 'transparent' && element.fill !== 'none' ? element.fill : element.color;
    ctx.globalAlpha = inheritedAlpha * 0.14; ctx.fillRect(x, height - barHeight, barWidth, barHeight); ctx.globalAlpha = inheritedAlpha;
    ctx.strokeRect(x, height - barHeight, barWidth, barHeight);
    cursor = { x: x + barWidth, y: height - barHeight };
  }
  ctx.restore();
  return cursor;
}

function renderImage(ctx: CanvasRenderingContext2D, element: SceneElement, progress: number, images: Map<string, CanvasImageSource>): { x: number; y: number } | null {
  const image = element.src ? images.get(element.src) : undefined;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, element.width * clamp(progress), element.height); ctx.clip();
  if (image) ctx.drawImage(image, 0, 0, element.width, element.height);
  else {
    // A useful missing-media placeholder is intentionally visible in preview and export.
    ctx.fillStyle = '#edf1f4'; ctx.fillRect(0, 0, element.width, element.height);
    ctx.strokeStyle = '#788b9d'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, element.width - 2, element.height - 2);
    ctx.beginPath(); ctx.moveTo(0, element.height); ctx.lineTo(element.width * 0.4, element.height * 0.4); ctx.lineTo(element.width * 0.6, element.height * 0.65); ctx.lineTo(element.width * 0.8, element.height * 0.3); ctx.lineTo(element.width, element.height * 0.6); ctx.stroke();
  }
  ctx.restore();
  return { x: element.width * clamp(progress), y: element.height * (0.25 + 0.5 * ((progress * 8) % 1)) };
}

/** Original stylized hand and pen; all paths are authored here. Pen nib is local (0, 0). */
function renderHand(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, element: SceneElement): void {
  const marker = element.animation.hand === 'marker';
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(-0.18);
  // Keep the hand a consistent natural size when objects are resized.
  const handScale = Math.max(0.7, Math.min(1.3, element.width / 340)); ctx.scale(handScale, handScale);
  ctx.shadowColor = 'rgba(16,30,45,0.15)'; ctx.shadowBlur = 5; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
  ctx.fillStyle = marker ? '#25364a' : '#f4f1e8'; ctx.strokeStyle = '#25364a'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(marker ? 9 : 6, 4); ctx.lineTo(58, 70); ctx.lineTo(50, 76); ctx.lineTo(3, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = element.color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3, 10); ctx.lineTo(9, 5); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = element.animation.handColor || '#deb38e'; ctx.strokeStyle = '#8f6850'; ctx.lineWidth = 1.4;
  const skin = new Path2D('M100 129 L64 81 C53 79 46 70 43 64 L28 43 C23 36 24 29 29 28 C35 26 42 39 47 43 L38 25 C35 19 38 13 43 15 C49 17 54 32 59 37 L54 21 C52 14 56 10 61 14 C67 20 68 34 72 40 L70 28 C69 20 74 18 78 24 L88 47 C94 59 91 67 95 75 L125 112 Z');
  ctx.fill(skin); ctx.stroke(skin);
  ctx.beginPath(); ctx.moveTo(43, 48); ctx.quadraticCurveTo(49, 42, 56, 47); ctx.lineTo(72, 62); ctx.moveTo(59, 38); ctx.lineTo(65, 49); ctx.moveTo(72, 40); ctx.lineTo(77, 49); ctx.moveTo(64, 81); ctx.quadraticCurveTo(78, 80, 95, 75); ctx.stroke();
  ctx.fillStyle = '#faf8f5'; ctx.beginPath(); ctx.ellipse(31, 35, 3, 5, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function renderElement(ctx: CanvasRenderingContext2D, element: SceneElement, localTime: number, images: Map<string, CanvasImageSource>, editing: boolean): void {
  const state = editing ? { visible: !element.hidden, drawProgress: 1, opacity: clamp(element.opacity), translateX: 0, translateY: 0, scale: 1, rotation: 0, exiting: false } : elementState(element, localTime);
  if (!state.visible || state.opacity <= 0 || element.width <= 0 || element.height <= 0) return;
  ctx.save();
  ctx.globalAlpha *= state.opacity;
  ctx.translate(element.x + element.width / 2 + state.translateX, element.y + element.height / 2 + state.translateY);
  ctx.rotate((element.rotation + state.rotation) * Math.PI / 180); ctx.scale(state.scale, state.scale); ctx.translate(-element.width / 2, -element.height / 2);
  let point: { x: number; y: number } | null = null;
  if (element.type === 'vector') point = renderVector(ctx, element, state.drawProgress);
  if (element.type === 'text') point = renderText(ctx, element, state.drawProgress);
  if (element.type === 'shape') point = renderShape(ctx, element, state.drawProgress);
  if (element.type === 'chart') point = renderChart(ctx, element, state.drawProgress);
  if (element.type === 'image') point = renderImage(ctx, element, state.drawProgress, images);
  if (!editing && element.animation.entrance === 'draw' && element.animation.hand !== 'none' && state.drawProgress > 0 && state.drawProgress < 1 && !state.exiting && point) renderHand(ctx, point, element);
  ctx.restore();
}

function paintBackground(ctx: CanvasRenderingContext2D, background: string, width: number, height: number): void {
  const special = ['paper', 'grid', 'dots', 'chalkboard'].includes(background);
  ctx.fillStyle = background === 'chalkboard' ? '#234239' : background === 'paper' ? '#fffcf4' : special ? '#ffffff' : background;
  ctx.fillRect(0, 0, width, height);
  if (background === 'grid' || background === 'dots') {
    ctx.save(); ctx.strokeStyle = '#e0e8ef'; ctx.fillStyle = '#cdd9e3'; ctx.lineWidth = 1;
    const step = Math.max(16, width / 32);
    for (let x = 0; x <= width; x += step) {
      if (background === 'grid') { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      else for (let y = 0; y <= height; y += step) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }
    }
    if (background === 'grid') for (let y = 0; y <= height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.restore();
  }
  if (background === 'paper') {
    // Deterministic restrained paper grain; no randomness or frame-to-frame flicker.
    ctx.save(); ctx.fillStyle = 'rgba(100,79,47,0.035)';
    for (let i = 0; i < 700; i++) { const x = ((i * 173 + 39) % 997) / 997 * width, y = ((i * 389 + 73) % 991) / 991 * height; ctx.fillRect(x, y, 1, 1); }
    ctx.restore();
  }
}

function renderSceneContent(ctx: CanvasRenderingContext2D, project: Project, scene: Scene, localTime: number, camera: Camera, options: RenderOptions, completedSceneIndex = -1): void {
  const scale = Math.min(options.width / project.width, options.height / project.height);
  ctx.save(); ctx.translate(options.width / 2, options.height / 2); ctx.scale(scale * Math.max(0.05, camera.zoom), scale * Math.max(0.05, camera.zoom)); ctx.translate(-camera.x, -camera.y);
  if (project.mode === 'roaming' && completedSceneIndex >= 0) {
    for (let i = 0; i <= completedSceneIndex; i++) for (const element of project.scenes[i].elements) renderElement(ctx, element, sceneDuration(project.scenes[i]), options.images, !!options.preview);
  }
  for (const element of scene.elements) renderElement(ctx, element, localTime, options.images, !!options.preview);
  ctx.restore();
}

/** Pure deterministic frame renderer shared by interactive preview and browser-based video export. */
export function renderProject(ctx: CanvasRenderingContext2D, project: Project, time: number, options: RenderOptions): void {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, options.width, options.height);
  const state = getSceneAtTime(project, time);
  if (!state) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, options.width, options.height); ctx.restore(); return; }
  const camera = options.preview ? state.scene.camera : cameraAtTime(project, state);
  const fading = !options.preview && project.mode !== 'roaming' && state.sceneIndex > 0 && state.scene.transition === 'fade' && state.scene.transitionDuration > 0 && state.localTime < state.scene.transitionDuration;
  if (fading) {
    const previous = project.scenes[state.sceneIndex - 1];
    paintBackground(ctx, previous.background, options.width, options.height);
    renderSceneContent(ctx, project, previous, sceneDuration(previous), sceneCameraAtTime(previous, sceneDuration(previous)), options);
    ctx.globalAlpha = clamp(state.localTime / state.scene.transitionDuration);
  }
  paintBackground(ctx, state.scene.background, options.width, options.height);
  renderSceneContent(ctx, project, state.scene, state.localTime, camera, options, state.sceneIndex - 1);
  ctx.restore();
}

export { getSceneAtTime, projectDuration, sceneDuration, elementDuration, elementEnd, sceneStart, elementState, cameraAtTime, sceneCameraAtTime, sortedCameraKeyframes, cameraKeyframeEnd, audioTrackStart, audioTrackDuration, audioVolumeAtTime, interpolateCamera } from './timeline';
