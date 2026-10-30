import type { Project } from './model';
import { assertProjectEdit } from './validation';

let database: Promise<IDBDatabase> | undefined;
function getDatabase() { return database ??= new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('vibecraft-studio', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('projects', { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
}); }
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const req = operation(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Saving was interrupted.'));
  });
}
export const saveProject = async (project: Project) => {assertProjectEdit(project,project);return transaction('readwrite', store => store.put(project));};
export const deleteProject = (id: string) => transaction('readwrite', store => store.delete(id));
export async function listProjects(): Promise<Project[]> {
  return (await transaction<Project[]>('readonly', store => store.getAll())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function portableProject(project: Project) {
  downloadBlob(new Blob([JSON.stringify(project)], { type: 'application/json' }), project.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() + '.vibecraft');
}
export const readDataURL = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
});
const loadedFonts = new Map<string,Promise<void>>();
export async function loadFonts(project: Project) {
  for (const font of project.fonts || []) {
    const identity = font.family + ':' + font.src;
    if (loadedFonts.has(identity)) continue;
    const pending=(async()=>{const face = new FontFace(font.family, 'url(' + font.src + ')');await face.load();document.fonts.add(face);})();loadedFonts.set(identity,pending);pending.catch(()=>loadedFonts.delete(identity));
  }
  await Promise.all((project.fonts||[]).map(font=>loadedFonts.get(font.family+':'+font.src)));
  const descriptors = new Set(project.scenes.flatMap(scene => scene.elements.filter(element => element.type === 'text').map(element => (element.fontWeight || 600) + ' ' + (element.fontSize || 64) + 'px "' + (element.fontFamily || 'Trebuchet MS') + '"')));
  await Promise.all([...descriptors].map(descriptor => document.fonts.load(descriptor)));
  await document.fonts.ready;
}
