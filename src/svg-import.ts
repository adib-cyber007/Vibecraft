import svgpath from 'svgpath';
import type { VectorPath } from './model';
import { assertSafeSvg } from './validation';

export type VectorSvgResult =
  | { kind: 'vector'; paths: VectorPath[]; width: number; height: number; pathCount: number }
  | { kind: 'image'; reason: string; width: number; height: number };
type Matrix = [number, number, number, number, number, number];
interface Paint { fill: string; stroke: string; strokeWidth: number; color: string; lineCap: 'butt' | 'round' | 'square'; lineJoin: 'bevel' | 'miter' | 'round'; fillRule: 'nonzero' | 'evenodd'; hidden: boolean }
interface Clip { inverse: Matrix; width: number; height: number }
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
class ImageFallback extends Error {}
const fallback = (reason: string): never => { throw new ImageFallback(reason); };
function numbers(value: string): number[] {
  const values = [...value.matchAll(NUMBER)].map(match => Number(match[0]));
  if (value.replace(NUMBER, '').replace(/[\s,]/g, '') || values.some(number => !Number.isFinite(number))) throw new Error('Malformed SVG number list.');
  return values;
}
export function multiplySvgMatrices(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left, [g, h, i, j, k, l] = right;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}
/** SVG transform order, including rotate(angle,cx,cy). Invalid transforms never silently disappear. */
export function parseSvgTransform(value: string | null): Matrix {
  if (!value?.trim()) return [...identity];
  let matrix: Matrix = [...identity], end = 0;
  for (const match of value.matchAll(/([A-Za-z]+)\s*\(([^)]*)\)/g)) {
    if (value.slice(end, match.index).replace(/[\s,]/g, '')) throw new Error('Malformed SVG transform.');
    const args = numbers(match[2]), [x, y] = args; let next: Matrix;
    switch (match[1]) {
      case 'matrix': if (args.length !== 6) throw new Error('SVG matrix needs six numbers.'); next = args as Matrix; break;
      case 'translate': if (args.length < 1 || args.length > 2) throw new Error('Invalid SVG translation.'); next = [1, 0, 0, 1, x, y ?? 0]; break;
      case 'scale': if (args.length < 1 || args.length > 2) throw new Error('Invalid SVG scale.'); next = [x, 0, 0, y ?? x, 0, 0]; break;
      case 'rotate': {
        if (args.length !== 1 && args.length !== 3) throw new Error('Invalid SVG rotation.');
        const angle = x * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), cx = args[1] ?? 0, cy = args[2] ?? 0;
        next = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; break;
      }
      case 'skewX': if (args.length !== 1) throw new Error('Invalid SVG skew.'); next = [1, 0, Math.tan(x * Math.PI / 180), 1, 0, 0]; break;
      case 'skewY': if (args.length !== 1) throw new Error('Invalid SVG skew.'); next = [1, Math.tan(x * Math.PI / 180), 0, 1, 0, 0]; break;
      default: return fallback(`The SVG transform ${match[1]} needs image rendering.`);
    }
    matrix = multiplySvgMatrices(matrix, next); end = match.index! + match[0].length;
  }
  if (value.slice(end).replace(/[\s,]/g, '') || matrix.some(number => !Number.isFinite(number) || Math.abs(number) > 1e9)) throw new Error('Malformed or excessive SVG transform.');
  return matrix;
}
function inverse(matrix: Matrix): Matrix {
  const [a, b, c, d, e, f] = matrix, determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) return fallback('The SVG has a collapsed transform.');
  return [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}
function uniformScale(matrix: Matrix): number | null {
  const [a, b, c, d] = matrix, x = Math.hypot(a, b), y = Math.hypot(c, d), tolerance = Math.max(1, x, y) * 1e-7;
  return Math.abs(x - y) <= tolerance && Math.abs(a * c + b * d) <= tolerance ? x : null;
}
function length(value: string | null, defaultValue = 0, percentBase?: number): number {
  if (value === null) return defaultValue;
  const match = /^\s*([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)\s*(px|%)?\s*$/.exec(value);
  if (!match) return fallback('SVG lengths using physical or font units need image rendering.');
  const valueNumber = Number(match[1]);
  if (!Number.isFinite(valueNumber) || Math.abs(valueNumber) > 1e6) throw new Error('SVG dimensions are excessive.');
  if (match[2] === '%' && percentBase === undefined) return fallback('Percentage root dimensions need image rendering.');
  return match[2] === '%' ? valueNumber * percentBase! / 100 : valueNumber;
}
function viewBox(node: Element): number[] | null {
  const attr = node.getAttribute('viewBox'); if (!attr) return null;
  const values = numbers(attr);
  if (values.length !== 4 || values[2] <= 0 || values[3] <= 0 || values.some(number => Math.abs(number) > 1e6)) throw new Error('SVG viewBox needs four finite numbers and positive dimensions.');
  return values;
}
function viewportMatrix(node: Element, width: number, height: number, box: number[] | null): Matrix {
  if (!box) return [...identity];
  const preserve = (node.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').trim().replace(/^defer\s+/, ''), sx = width / box[2], sy = height / box[3];
  if (preserve === 'none') return [sx, 0, 0, sy, -box[0] * sx, -box[1] * sy];
  const match = /^(xMin|xMid|xMax)(YMin|YMid|YMax)(?:\s+(meet|slice))?$/.exec(preserve);
  if (!match) return fallback('This SVG aspect-ratio mode needs image rendering.');
  const scale = match[3] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy), x = (width - box[2] * scale) * (match[1] === 'xMin' ? 0 : match[1] === 'xMid' ? 0.5 : 1), y = (height - box[3] * scale) * (match[2] === 'YMin' ? 0 : match[2] === 'YMid' ? 0.5 : 1);
  return [scale, 0, 0, scale, x - box[0] * scale, y - box[1] * scale];
}
function normalizeColor(value: string, inheritedColor: string): string {
  if (value.toLowerCase() === 'currentcolor') return inheritedColor;
  if (value === 'none' || value === 'transparent') return value;
  if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    if (value.slice(-2).toLowerCase() === 'ff') return value.slice(0, 7);
    if (value.slice(-2) === '00') return 'transparent';
    return fallback('Partly transparent SVG colors need image rendering.');
  }
  if (/^#[0-9a-f]{4}$/i.test(value)) {
    const expanded = '#' + [...value.slice(1)].map(char => char + char).join(''); return normalizeColor(expanded, inheritedColor);
  }
  if (/url\s*\(|var\s*\(/i.test(value)) return fallback('SVG gradients and paint references need image rendering.');
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !CSS.supports('color', value)) return fallback(`The SVG color ${value} needs image rendering.`);
  ctx.fillStyle = value; const normalized = ctx.fillStyle;
  if (normalized.startsWith('#')) return normalizeColor(normalized, inheritedColor);
  const rgba = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(normalized);
  if (!rgba) return fallback('Wide-gamut SVG colors need image rendering.');
  if (rgba[4] !== undefined && Number(rgba[4]) !== 1) return Number(rgba[4]) === 0 ? 'transparent' : fallback('Partly transparent SVG colors need image rendering.');
  return '#' + rgba.slice(1, 4).map(component => Math.round(Number(component)).toString(16).padStart(2, '0')).join('');
}
function paintFor(node: Element, parent: Paint): Paint {
  const result = { ...parent };
  if (node.getAttribute('display') === 'none') result.hidden = true;
  if (node.getAttribute('visibility') === 'hidden' || node.getAttribute('visibility') === 'collapse') {
    if (node.children.length) return fallback('SVG visibility overrides need image rendering.');
    result.hidden = true;
  }
  for (const name of ['opacity', 'fill-opacity', 'stroke-opacity']) {
    const value = node.getAttribute(name);
    if (value === null) continue;
    const opacity = Number(value);
    if (opacity === 0) { if (name === 'opacity') result.hidden = true; else result[name === 'fill-opacity' ? 'fill' : 'stroke'] = 'none'; }
    else if (opacity !== 1) return fallback('SVG partial opacity needs image rendering.');
  }
  if (node.hasAttribute('color')) result.color = node.getAttribute('color') === 'inherit' ? parent.color : normalizeColor(node.getAttribute('color')!.trim(), parent.color);
  if (node.hasAttribute('fill') && node.getAttribute('fill-opacity') !== '0') result.fill = node.getAttribute('fill') === 'inherit' ? parent.fill : normalizeColor(node.getAttribute('fill')!.trim(), result.color);
  if (node.hasAttribute('stroke') && node.getAttribute('stroke-opacity') !== '0') result.stroke = node.getAttribute('stroke') === 'inherit' ? parent.stroke : normalizeColor(node.getAttribute('stroke')!.trim(), result.color);
  if (node.hasAttribute('stroke-width')) result.strokeWidth = Math.max(0, length(node.getAttribute('stroke-width')));
  const lineCap = node.getAttribute('stroke-linecap');
  if (lineCap) { if (!['butt', 'round', 'square'].includes(lineCap)) return fallback('This SVG line cap needs image rendering.'); result.lineCap = lineCap as Paint['lineCap']; }
  const lineJoin = node.getAttribute('stroke-linejoin');
  if (lineJoin) { if (!['bevel', 'miter', 'round'].includes(lineJoin)) return fallback('This SVG line join needs image rendering.'); result.lineJoin = lineJoin as Paint['lineJoin']; }
  const fillRule = node.getAttribute('fill-rule');
  if (fillRule) { if (!['nonzero', 'evenodd'].includes(fillRule)) return fallback('This SVG fill rule needs image rendering.'); result.fillRule = fillRule as Paint['fillRule']; }
  if (node.hasAttribute('stroke-miterlimit') && Number(node.getAttribute('stroke-miterlimit')) !== 4) return fallback('A custom SVG miter limit needs image rendering.');
  for (const name of ['stroke-dasharray', 'stroke-dashoffset', 'vector-effect', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'paint-order']) {
    const value = node.getAttribute(name); if (value !== null && value !== 'none' && value !== '0' && value !== 'normal') return fallback(`SVG ${name} needs image rendering.`);
  }
  for (const name of ['transform-origin', 'transform-box', 'mix-blend-mode', 'isolation']) if (node.hasAttribute(name)) return fallback(`SVG ${name} needs image rendering.`);
  return result;
}
function shapePath(node: Element, width: number, height: number): string | null {
  const n = (name: string, defaultValue = 0, base?: number) => length(node.getAttribute(name), defaultValue, base);
  switch (node.localName) {
    case 'path': return node.getAttribute('d') || null;
    case 'line': return `M${n('x1', 0, width)} ${n('y1', 0, height)} L${n('x2', 0, width)} ${n('y2', 0, height)}`;
    case 'polyline': case 'polygon': {
      const points = numbers(node.getAttribute('points') ?? '');
      if (points.length % 2) throw new Error('SVG points need coordinate pairs.');
      if (points.length < 4) return null;
      return `M${points[0]} ${points[1]} ` + Array.from({ length: points.length / 2 - 1 }, (_, index) => `L${points[index * 2 + 2]} ${points[index * 2 + 3]}`).join(' ') + (node.localName === 'polygon' ? ' Z' : '');
    }
    case 'rect': {
      const x = n('x', 0, width), y = n('y', 0, height), w = n('width', 0, width), h = n('height', 0, height);
      if (w < 0 || h < 0) throw new Error('SVG rectangles need nonnegative dimensions.');
      if (!w || !h) return null;
      const rx = Math.min(w / 2, Math.max(0, node.hasAttribute('rx') ? n('rx', 0, width) : n('ry', 0, height))), ry = Math.min(h / 2, Math.max(0, node.hasAttribute('ry') ? n('ry', 0, height) : rx));
      return rx && ry ? `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z` : `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
    }
    case 'circle': case 'ellipse': {
      const cx = n('cx', 0, width), cy = n('cy', 0, height), rx = node.localName === 'circle' ? n('r', 0, Math.hypot(width, height) / Math.SQRT2) : n('rx', 0, width), ry = node.localName === 'circle' ? rx : n('ry', 0, height);
      if (rx < 0 || ry < 0) throw new Error('SVG radii cannot be negative.');
      return rx && ry ? `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z` : null;
    }
    default: return fallback(`SVG <${node.localName}> needs image rendering.`);
  }
}

/** Converts a safe SVG into editable draw paths. Unsupported appearance returns an explicit image fallback. */
export function parseVectorSvg(svg: string): VectorSvgResult {
  assertSafeSvg(svg);
  if (typeof DOMParser === 'undefined') throw new Error('SVG import needs the browser DOM parser.');
  const documentSvg = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentSvg.querySelector('parsererror') || documentSvg.documentElement.localName !== 'svg') throw new Error('The SVG document is malformed.');
  const root = documentSvg.documentElement;
  if (documentSvg.querySelectorAll('*').length > 2000) throw new Error('SVG contains too many nodes (maximum 2,000).');
  let width = 300, height = 150;
  try {
    const rootBox = viewBox(root);
    width = length(root.getAttribute('width'), rootBox?.[2] ?? 300); height = length(root.getAttribute('height'), rootBox?.[3] ?? 150);
    if (width <= 0 || height <= 0) throw new Error('SVG dimensions must be positive.');
    const normalized: Matrix = [100 / width, 0, 0, 100 / height, 0, 0], output: VectorPath[] = [];
    let pathCharacters = 0;
    const walk = (node: Element, matrix: Matrix, inherited: Paint, viewportWidth: number, viewportHeight: number, clips: Clip[], depth: number) => {
      if (depth > 32) throw new Error('SVG nesting exceeds 32 levels.');
      if (node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/2000/svg') return fallback('SVG foreign namespaces need image rendering.');
      if (['title', 'desc'].includes(node.localName)) return;
      const paint = paintFor(node, inherited); if (paint.hidden) return;
      let nextMatrix = multiplySvgMatrices(matrix, parseSvgTransform(node.getAttribute('transform'))), nextWidth = viewportWidth, nextHeight = viewportHeight, nextClips = clips;
      if (node.localName === 'svg') {
        const isRoot = node === root, localWidth = isRoot ? width : length(node.getAttribute('width'), viewportWidth, viewportWidth), localHeight = isRoot ? height : length(node.getAttribute('height'), viewportHeight, viewportHeight), box = viewBox(node);
        if (localWidth <= 0 || localHeight <= 0) return;
        const placement: Matrix = [1, 0, 0, 1, isRoot ? 0 : length(node.getAttribute('x'), 0, viewportWidth), isRoot ? 0 : length(node.getAttribute('y'), 0, viewportHeight)];
        nextMatrix = multiplySvgMatrices(nextMatrix, placement);
        // Nested viewport clipping cannot be encoded in VectorPath. Accept it only when the control hull fits.
        if (!isRoot && node.getAttribute('overflow') !== 'visible') nextClips = [...clips, { inverse: inverse(nextMatrix), width: localWidth, height: localHeight }];
        nextMatrix = multiplySvgMatrices(nextMatrix, viewportMatrix(node, localWidth, localHeight, box));
        nextWidth = box?.[2] ?? localWidth; nextHeight = box?.[3] ?? localHeight;
      }
      if (node.localName === 'g' || node.localName === 'svg') { for (const child of node.children) walk(child, nextMatrix, paint, nextWidth, nextHeight, nextClips, depth + 1); return; }
      const source = shapePath(node, nextWidth, nextHeight); if (!source) return;
      if (source.length > 100000) throw new Error('An SVG path exceeds 100,000 characters.');
      const parsed = svgpath(source);
      if ((parsed as unknown as { err?: string }).err) throw new Error('An SVG path is malformed.');
      const world = parsed.abs().unshort().unarc().matrix(nextMatrix);
      for (const clip of nextClips) {
        let outside = false;
        svgpath(world.toString()).matrix(clip.inverse).abs().unshort().unarc().iterate((segment, _index, currentX, currentY) => {
          if (segment[0] === 'H') { const x = Number(segment[1]); if (x < -1e-5 || x > clip.width + 1e-5 || currentY < -1e-5 || currentY > clip.height + 1e-5) outside = true; return; }
          if (segment[0] === 'V') { const y = Number(segment[1]); if (currentX < -1e-5 || currentX > clip.width + 1e-5 || y < -1e-5 || y > clip.height + 1e-5) outside = true; return; }
          for (let i = 1; i + 1 < segment.length; i += 2) { const x = Number(segment[i]), y = Number(segment[i + 1]); if (x < -1e-5 || y < -1e-5 || x > clip.width + 1e-5 || y > clip.height + 1e-5) outside = true; }
        });
        if (outside) return fallback('SVG content clipped by a nested viewport needs image rendering.');
      }
      if ((paint.fill === 'none' || paint.fill === 'transparent') && (paint.stroke === 'none' || paint.stroke === 'transparent' || paint.strokeWidth === 0)) return;
      const scale = uniformScale(nextMatrix);
      if (paint.stroke !== 'none' && paint.stroke !== 'transparent' && paint.strokeWidth && scale === null) return fallback('Nonuniformly transformed SVG strokes need image rendering.');
      const d = svgpath(world.toString()).matrix(normalized).abs().round(6).toString();
      pathCharacters += d.length;
      if (d.length > 100000 || pathCharacters > 1_000_000 || output.length >= 200) throw new Error('SVG exceeds the drawing limit of 200 paths or 1,000,000 path characters.');
      const normalizedStroke = paint.strokeWidth * (scale ?? 1) * 100 / width;
      if (!Number.isFinite(normalizedStroke) || normalizedStroke > 100000) throw new Error('SVG stroke width exceeds the drawing resource limit.');
      output.push({ d, fill: paint.fill, stroke: paint.stroke, strokeWidth: normalizedStroke, lineCap: paint.lineCap, lineJoin: paint.lineJoin, fillRule: paint.fillRule });
    };
    walk(root, identity, { fill: '#000000', stroke: 'none', strokeWidth: 1, color: '#000000', lineCap: 'butt', lineJoin: 'miter', fillRule: 'nonzero', hidden: false }, width, height, [], 0);
    if (!output.length) return { kind: 'image', reason: 'The SVG has no visible supported draw paths.', width, height };
    return { kind: 'vector', paths: output, width, height, pathCount: output.length };
  } catch (error) {
    if (error instanceof ImageFallback) return { kind: 'image', reason: error.message, width, height };
    throw error;
  }
}
