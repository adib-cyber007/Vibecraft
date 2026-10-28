import { z } from 'zod';
import type { Project } from './model';
import { projectDuration } from './engine/timeline';

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_ASSET_BYTES = 40 * 1024 * 1024;
export const MAX_DURATION = 600;
const number = (min: number, max: number) => z.number().finite().min(min).max(max);
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const label = z.string().max(300);
const color = z.string().regex(/^(#[0-9a-fA-F]{3,8}|transparent|none)$/);
const dataUrlPattern = /^data:([a-z0-9.+/-]+)(?:;codecs=[a-z0-9.,-]+)?;base64,([A-Za-z0-9+/]*={0,2})$/i;
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']);

/** Reject active SVG content rather than trusting the browser's image sandbox. */
export function assertSafeSvg(svg: string): void {
  if (svg.length > 4 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(svg)) throw new Error('SVG declarations are not supported.');
  const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc', 'text', 'tspan', 'use']);
  const clean = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^?]*\?>/g, '');
  if (!/^\s*<svg(?:\s|>)/i.test(clean)) throw new Error('Image is not an SVG document.');
  for (const match of clean.matchAll(/<\/?\s*([\w:.-]+)/g)) {
    if (!allowed.has(match[1].toLowerCase())) throw new Error(`Unsupported SVG element: ${match[1]}`);
  }
  if (/\s(?:on[\w:-]+|style)\s*=/i.test(clean) || /(?:javascript|vbscript)\s*:|@import|\\[0-9a-f]{1,6}/i.test(clean)) throw new Error('SVG active content or inline styles are not supported.');
  for (const match of clean.matchAll(/\s(?:[\w-]+:)?href\s*=\s*(["'])(.*?)\1/gi)) {
    if (!/^#[A-Za-z0-9_-]+$/.test(match[2])) throw new Error('SVG external references are not supported.');
  }
  if (/\s(?:[\w-]+:)?href\s*=\s*[^\s"']/i.test(clean)) throw new Error('Malformed SVG reference.');
  for (const match of clean.matchAll(/url\s*\((.*?)\)/gi)) {
    if (!/^\s*["']?#[A-Za-z0-9_-]+["']?\s*$/.test(match[1])) throw new Error('SVG external URLs are not supported.');
  }
  // XML character references can hide an active URL or an attribute name.
  if (/&#(?:x[0-9a-f]+|\d+);/i.test(clean)) throw new Error('SVG numeric entities are not supported.');
}

export function decodeDataUrl(src: string, kind: 'image' | 'audio'): { mime: string; bytes: Uint8Array } {
  const match = dataUrlPattern.exec(src);
  if (!match || match[2].length % 4 !== 0 || !(kind === 'image' ? imageTypes : audioTypes).has(match[1].toLowerCase())) throw new Error(`Unsupported ${kind} data URL.`);
  const base64 = match[2];
  const byteLength = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (byteLength <= 0 || byteLength > MAX_ASSET_BYTES) throw new Error(`Each ${kind} asset must be between 1 byte and 20 MB.`);
  const bytes = typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(base64, 'base64')) : Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (match[1].toLowerCase() === 'image/svg+xml') assertSafeSvg(new TextDecoder().decode(bytes));
  return { mime: match[1].toLowerCase(), bytes };
}

const imageSrc = z.string().max(Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 200).superRefine((src, ctx) => {
  try { decodeDataUrl(src, 'image'); } catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); }
});
const audioSrc = z.string().max(Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 200).superRefine((src, ctx) => {
  try { decodeDataUrl(src, 'audio'); } catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); }
});
const fontSrc = z.string().max(10 * 1024 * 1024).refine(src => /^data:(?:font\/(?:ttf|otf|woff|woff2)|application\/(?:octet-stream|x-font-ttf|x-font-opentype|font-woff|font-sfnt));base64,[A-Za-z0-9+/]+={0,2}$/i.test(src), 'Fonts must be embedded TTF, OTF, WOFF or WOFF2 data URLs.');
const animation = z.object({ start: number(0, 600), draw: number(0, 600), hold: number(0, 600), exit: number(0, 600), entrance: z.enum(['draw', 'fade', 'move', 'pop', 'none']), exitStyle: z.enum(['none', 'fade', 'erase', 'move']), emphasis: z.enum(['none', 'pulse', 'wiggle']), hand: z.enum(['pen', 'marker', 'none']), handColor: color }).strict();
const element = z.object({
  id, type: z.enum(['text', 'vector', 'image', 'shape', 'chart']), name: label,
  x: number(-100000, 100000), y: number(-100000, 100000), width: number(0.1, 100000), height: number(0.1, 100000), rotation: number(-36000, 36000), opacity: number(0, 1), locked: z.boolean(), hidden: z.boolean(), color, fill: color, strokeWidth: number(0, 100),
  text: z.string().max(10000).optional(), fontFamily: z.string().min(1).max(120).regex(/^[\p{L}\p{N}\s_,.-]+$/u).optional(), fontSize: number(1, 1000).optional(), fontWeight: number(100, 900).optional(), align: z.enum(['left', 'center', 'right']).optional(),
  paths: z.array(z.object({ d: z.string().min(1).max(100000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/), fill: color.optional(), stroke: color.optional(), strokeWidth: number(0,100000).optional(), lineCap: z.enum(['butt','round','square']).optional(), lineJoin: z.enum(['bevel','miter','round']).optional(), fillRule: z.enum(['nonzero','evenodd']).optional() }).strict()).max(200).optional(), src: imageSrc.optional(), shape: z.enum(['rectangle', 'ellipse', 'line', 'arrow']).optional(), chartValues: z.array(number(0, 1000000000)).min(1).max(100).optional(), animation,
}).strict().superRefine((value, ctx) => {
  if (value.type === 'image' && !value.src) ctx.addIssue({ code: 'custom', message: 'Image elements require embedded image data.' });
  if (value.type === 'vector' && !value.paths?.length) ctx.addIssue({ code: 'custom', message: 'Vector elements require paths.' });
  if (value.type === 'text' && value.text === undefined) ctx.addIssue({ code: 'custom', message: 'Text elements require text.' });
});
const camera = z.object({ x: number(-100000, 100000), y: number(-100000, 100000), zoom: number(0.05, 20) }).strict();
const cameraKeyframe = z.object({ id, name: label, start: number(0, 600), duration: number(0, 600), pause: number(0, 600), camera, easing: z.enum(['none', 'linear', 'ease-out']), locked: z.boolean(), pinned: z.boolean() }).strict();
const scene = z.object({ id, name: label, background: color, duration: number(0.1, 600), transition: z.enum(['cut', 'fade', 'pan']), transitionDuration: number(0, 30), camera, cameras: z.array(cameraKeyframe).min(1).max(100).optional(), elements: z.array(element).max(150) }).strict().superRefine((value, ctx) => {
  if (value.cameras?.[0].start !== undefined && value.cameras[0].start !== 0) ctx.addIssue({ code: 'custom', path: ['cameras', 0, 'start'], message: 'The starting camera must be at the beginning of its scene.' });
});
const audio = z.object({ id, name: label, src: audioSrc, kind: z.enum(['music', 'voice']), start: number(0, 600), trimStart: number(0, 3600), trimEnd: number(0, 3600), volume: number(0, 1), fadeIn: number(0, 600), fadeOut: number(0, 600), sceneId: id.optional() }).strict().superRefine((track, ctx) => {
  if (track.trimEnd <= track.trimStart) ctx.addIssue({ code: 'custom', message: 'Audio trim end must follow trim start.' });
});
const projectSchema = z.object({ version: z.literal(1), id, title: label, width: z.union([z.literal(1920), z.literal(1080), z.literal(1280)]), height: z.union([z.literal(1080), z.literal(1920), z.literal(1280)]), mode: z.enum(['scenes', 'roaming']), scenes: z.array(scene).min(1).max(25), audio: z.array(audio).max(50), fonts: z.array(z.object({ family: z.string().min(1).max(100).regex(/^[\p{L}\p{N}\s_-]+$/u), src: fontSrc }).strict()).max(20).optional(), script: z.string().max(50000).optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict();

export function parseProject(input: unknown): Project {
  const project = projectSchema.parse(input) as Project;
  if (![[1920, 1080], [1080, 1920], [1080, 1080], [1280, 1280]].some(([w, h]) => project.width === w && project.height === h)) throw new Error('Unsupported project aspect ratio.');
  const ids = new Set<string>();
  let assetBytes = 0, elements = 0;
  const sources = new Set<string>();
  for (const item of [...project.scenes, ...project.scenes.flatMap(s => s.elements), ...project.scenes.flatMap(s => s.cameras ?? []), ...project.audio]) {
    if (ids.has(item.id)) throw new Error('Duplicate scene, element, camera or audio ID.');
    ids.add(item.id);
  }
  for (const scene of project.scenes) {
    elements += scene.elements.length;
    for (const element of scene.elements) if (element.src && !sources.has(element.src)) { sources.add(element.src); assetBytes += decodeDataUrl(element.src, 'image').bytes.byteLength; }
  }
  for (const track of project.audio) {
    if (track.sceneId && !project.scenes.some(s => s.id === track.sceneId)) throw new Error('Audio refers to a missing scene.');
    if (!sources.has(track.src)) { sources.add(track.src); assetBytes += decodeDataUrl(track.src, 'audio').bytes.byteLength; }
  }
  for (const font of (project as Project & { fonts?: { src: string }[] }).fonts ?? []) assetBytes += font.src.slice(font.src.indexOf(',') + 1).length * 3 / 4;
  if (elements > 500) throw new Error('A project may contain at most 500 elements.');
  if (assetBytes > MAX_PROJECT_ASSET_BYTES) throw new Error('Project assets exceed the 40 MB limit.');
  if (projectDuration(project) > MAX_DURATION) throw new Error('The project exceeds the 10 minute render limit.');
  return project;
}
