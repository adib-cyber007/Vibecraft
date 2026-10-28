import { useEffect, useRef, useState } from 'react';
import { Copy, FileText, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { createElement, createScene, defaultAnimation, type Project, type Scene } from './model';
import { assets, assetById } from './assets';
import type { Edit } from './Stage';
import { projectDuration } from './engine/timeline';

interface Props { project: Project; sceneId: string; edit: Edit; notify: (message: string) => void; onScene?: (id: string) => void }
interface StoryScene { title: string; narration: string; visual: string }
interface AIStatus { available: boolean; models: string[]; error?: string }
const recommendations: [RegExp, string][] = [
  [/\b(learn|book|teach|read|education|lesson|student|knowledge)\b/i, 'book'],
  [/\b(team|people|together|collaborat|employee|staff|community)\b/i, 'team'],
  [/\b(grow|growth|profit|chart|increase|progress|revenue)\b/i, 'growth'],
  [/\b(world|global|earth|planet|country)\b/i, 'globe'],
  [/\b(launch|rocket|start|journey|future)\b/i, 'rocket'],
  [/\b(safe|trust|secur|protect|privacy)\b/i, 'shield'],
  [/\b(tech|computer|software|code|digital)\b/i, 'laptop'],
  [/\b(nature|green|leaf|sustain|environment)\b/i, 'leaf'],
  [/\b(health|love|care|heart|wellbeing)\b/i, 'heart'],
  [/\b(goal|focus|target|achieve|aim)\b/i, 'target'],
  [/\b(question|why|ask|problem|challenge)\b/i, 'question'],
  [/\b(connect|talk|chat|message|communication)\b/i, 'chat'],
  [/\b(time|clock|schedule|deadline)\b/i, 'clock'],
];
function chooseAsset(content: string, index: number) {
  return assetById[recommendations.find(([expression]) => expression.test(content))?.[1] ?? ['lightbulb', 'puzzle', 'rocket', 'target'][index % 4]] ?? assets[0];
}
function createStoryScene(project: Project, source: StoryScene, index: number): Scene {
  const asset = chooseAsset(`${source.visual} ${source.title}`, index), width = project.width, height = project.height, portrait = height > width;
  const headingSize = portrait ? 76 : width < 1500 ? 66 : 82, bodySize = portrait ? 40 : width < 1500 ? 30 : 38;
  const duration = Math.min(90, Math.max(7, source.narration.split(/\s+/).length / 2.3 + 2));
  const title = createElement('text', { name: source.title.slice(0, 280), text: source.title, x: width * 0.08, y: height * 0.08, width: width * 0.84, height: height * (portrait ? 0.2 : 0.22), fontFamily: 'Kalam', fontSize: headingSize, fontWeight: 700, align: 'center', animation: { ...defaultAnimation(), start: 0, draw: 1.6, hold: 1 } });
  const illustration = createElement('vector', { name: asset.name, paths: structuredClone(asset.paths), x: portrait ? width * 0.23 : width * 0.12, y: portrait ? height * 0.31 : height * 0.35, width: portrait ? width * 0.54 : Math.min(width * 0.29, height * 0.48), height: portrait ? width * 0.54 : Math.min(width * 0.29, height * 0.48), strokeWidth: 1.7, color: '#345a4b', animation: { ...defaultAnimation(), start: 1.4, draw: 2.5, hold: 1 } });
  // Narration remains in the script in full. The canvas gets a readable visual cue, not a wall of words.
  const visualText = source.visual.length > 150 ? source.visual.slice(0, 147).replace(/\s+\S*$/, '') + '…' : source.visual;
  const caption = createElement('text', { name: 'Visual cue', text: visualText, x: portrait ? width * 0.08 : width * 0.48, y: portrait ? height * 0.68 : height * 0.4, width: portrait ? width * 0.84 : width * 0.44, height: portrait ? height * 0.22 : height * 0.46, fontFamily: 'DM Sans', fontSize: bodySize, fontWeight: 500, align: portrait ? 'center' : 'left', color: '#3f5b4d', animation: { ...defaultAnimation(), start: 4.2, draw: 1.8, hold: 1, hand: 'none' } });
  return createScene(width, height, { name: source.title.slice(0, 280), background: index % 2 ? '#f3f7f3' : '#ffffff', duration, elements: [title, illustration, caption] });
}

export function ScriptPanel({ project, sceneId, edit, notify, onScene }: Props) {
  const [brief, setBrief] = useState(''), [status, setStatus] = useState<AIStatus>({ available: false, models: [] }), [model, setModel] = useState(''), [checking, setChecking] = useState(true), [generating, setGenerating] = useState(false), [result, setResult] = useState<StoryScene[] | null>(null), [error, setError] = useState('');
  const mounted = useRef(true), request = useRef<AbortController | null>(null), scene = project.scenes.find(item => item.id === sceneId);
  const refreshModels = async () => {
    setChecking(true); const controller = new AbortController();
    try {
      const response = await fetch('/api/ai/status', { signal: controller.signal });
      if (!response.ok) throw new Error('Local model status could not be loaded.');
      const next = await response.json() as AIStatus;
      if (!mounted.current) return;
      setStatus(next); setModel(current => next.models.includes(current) ? current : next.models[0] ?? '');
    } catch (cause) { if (mounted.current && (cause as Error).name !== 'AbortError') setStatus({ available: false, models: [], error: (cause as Error).message }); }
    finally { if (mounted.current) setChecking(false); }
  };
  useEffect(() => { mounted.current = true; refreshModels(); return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const generate = async () => {
    if (!brief.trim() || !model || generating) return;
    setGenerating(true); setError(''); const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/ai/script', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: brief.trim(), model }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The local model could not create a storyboard.');
      if (!Array.isArray(data.scenes) || !data.scenes.length || !data.scenes.every((item: StoryScene) => typeof item.title === 'string' && typeof item.narration === 'string' && typeof item.visual === 'string')) throw new Error('The local model returned an incomplete storyboard. Try another text model.');
      if (mounted.current) setResult(data.scenes);
    } catch (cause) { if (mounted.current && (cause as Error).name !== 'AbortError') setError((cause as Error).message); }
    finally { if (mounted.current) setGenerating(false); request.current = null; }
  };
  const addStoryboard = () => {
    if (!result) return;
    const room = 25 - project.scenes.length;
    if (result.length > room) { notify(`There is room for ${room} more scenes. Remove scenes before adding this storyboard.`); return; }
    const scenes = result.map((item, index) => createStoryScene(project, item, index));
    const script = result.map((item, index) => `${index + 1}. ${item.title}\n${item.narration}`).join('\n\n');
    if ((project.script?.length ?? 0) + script.length + 2 > 50000) { notify('Shorten the project script before adding this storyboard.'); return; }
    if (projectDuration({ ...project, scenes: [...project.scenes, ...scenes] }) > 600) { notify('This storyboard would take the project over its 10 minute limit. Shorten existing scenes first.'); return; }
    if (project.scenes.reduce((sum, scene) => sum + scene.elements.length, 0) + scenes.length * 3 > 500) { notify('This storyboard would exceed the project’s 500 element limit.'); return; }
    edit(next => { next.scenes.push(...scenes); next.script = [next.script?.trim(), script].filter(Boolean).join('\n\n'); });
    onScene?.(scenes[0].id); notify(`Added ${scenes.length} storyboard scenes. Your existing scenes are preserved.`); setResult(null);
  };
  const addScriptHeading = () => {
    if (!scene) return;
    const text = project.script?.trim().split('\n').find(line => line.trim()) || 'Tell your story';
    if (scene.elements.length >= 150 || project.scenes.reduce((sum, current) => sum + current.elements.length, 0) >= 500) { notify('Remove an element before adding another heading.'); return; }
    const element = createElement('text', { name: 'Script heading', text: text.slice(0, 300), x: project.width * 0.1, y: project.height * 0.1, width: project.width * 0.8, height: project.height * 0.25, fontFamily: 'Kalam', fontSize: Math.min(86, project.width / 18), align: 'center' });
    edit(next => { next.scenes.find(current => current.id === scene.id)?.elements.push(element); }); notify('Added a heading to the current scene.');
  };
  return <div className="script-panel">
    <section className="panel-section"><h3><FileText size={17} /> The story behind your story</h3><p className="muted">Plan your narration and key ideas here. This script is saved with the project.</p>
      <label className="field">Project script<textarea aria-label="Project script" rows={12} maxLength={50000} placeholder="Start with a problem. Show a better way. End with a next step.\n\nWrite your narration here…" value={project.script ?? ''} onChange={event => edit(next => { next.script = event.target.value; })} /></label>
      <div className="field-row"><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(project.script ?? ''); notify('Copied the project script.'); } catch { notify('The clipboard is unavailable. Select and copy the script text.'); } }}><Copy size={15} />Copy script</button><button className="secondary-button" onClick={addScriptHeading}><Plus size={15} />Add heading</button></div>
      <small className="muted">Use the Audio panel to turn your script into narration.</small>
    </section>
    <section className="panel-section"><h3><Sparkles size={17} /> Create a storyboard</h3><p className="muted">An installed local text model can turn your brief into a script and editable scenes.</p>
      <label className="field">Your brief<textarea rows={5} maxLength={12000} placeholder="What should the video explain? Who is it for? What should viewers do next?" value={brief} onChange={event => setBrief(event.target.value)} /></label>
      <label className="field">Local model<select aria-label="Storyboard model" value={model} onChange={event => setModel(event.target.value)} disabled={checking || generating || !status.models.length}>{!status.models.length && <option value="">{checking ? 'Checking local models…' : 'No local models available'}</option>}{status.models.map(name => <option value={name} key={name}>{name}</option>)}</select></label>
      <button className="small-button" disabled={checking || generating} onClick={refreshModels}><RefreshCw size={14} />{checking ? 'Checking…' : 'Refresh local models'}</button>
      {!checking && (!status.available || !status.models.length) && <p className="muted" role="status">{status.error || 'Start Ollama with an installed text model, then refresh the list.'}</p>}
      {generating ? <div style={{ marginTop: 14 }}><p role="status" className="muted">Writing your storyboard locally. Larger models can take a minute or two.</p><button className="secondary-button" onClick={() => { request.current?.abort(); notify('Stopped waiting. The local model may still finish its request in the background.'); }}>Stop waiting</button></div> : <button className="primary-button" style={{ marginTop: 14 }} disabled={!status.available || !model || brief.trim().length < 5} onClick={generate}><Sparkles size={16} />Generate storyboard</button>}
      {error && <p role="alert" className="panel-error">{error}</p>}
      <small className="muted">Generation uses your local Ollama server. This does not use VideoScribe’s AI service.</small>
    </section>
    {result && <section className="panel-section"><h3>Review your storyboard</h3><p className="muted">Edit the draft below, then add it as new scenes.</p>{result.map((item, index) => <article className="storyboard-scene" key={index} style={{ borderTop: '1px solid #dfe6e1', padding: '12px 0' }}><label className="field">Scene {index + 1} title<input value={item.title} maxLength={150} onChange={event => setResult(current => current!.map((scene, i) => i === index ? { ...scene, title: event.target.value } : scene))} /></label><label className="field">Narration<textarea rows={3} value={item.narration} maxLength={4000} onChange={event => setResult(current => current!.map((scene, i) => i === index ? { ...scene, narration: event.target.value } : scene))} /></label><label className="field">Drawing idea<textarea rows={2} value={item.visual} maxLength={1000} onChange={event => setResult(current => current!.map((scene, i) => i === index ? { ...scene, visual: event.target.value } : scene))} /></label></article>)}<button className="primary-button" disabled={result.some(item => !item.title.trim() || !item.narration.trim() || !item.visual.trim())} onClick={addStoryboard}><Plus size={16} />Create {result.length} storyboard scenes</button><p className="muted">Uses original illustrations from your local library. Existing scenes stay in the project.</p></section>}
  </div>;
}
