import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Mic, Music, Pause, Play, Scissors, Square, Trash2, Upload, Volume2 } from 'lucide-react';
import { makeId, type AudioTrack, type Project } from './model';
import type { Edit } from './Stage';
import { readDataURL } from './storage';
import { audioTrackStart, clamp } from './engine/timeline';

interface Props { project: Project; sceneId: string; edit: Edit; notify: (message: string) => void; selectedId?: string; time?: number }
interface Voice { name: string; language: string }
interface WaveData { duration: number; peaks: number[] }
const MAX_FILE = 20 * 1024 * 1024, MAX_TOTAL = 40 * 1024 * 1024;
const waveCache = new Map<string, Promise<WaveData>>();
function existingAssetBytes(project: Project): number {
  const sources = new Set([...project.audio.map(track => track.src), ...project.scenes.flatMap(scene => scene.elements.map(element => element.src).filter((src): src is string => !!src)), ...(project.fonts ?? []).map(font => font.src)]);
  return [...sources].reduce((sum, src) => sum + (src.length - src.indexOf(',') - 1) * 0.75, 0);
}
async function decodeWave(src: string): Promise<WaveData> {
  let result = waveCache.get(src);
  if (!result) {
    result = (async () => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(await (await fetch(src)).arrayBuffer());
        const channel = buffer.getChannelData(0), peaks: number[] = [], columns = 180, chunk = Math.max(1, Math.ceil(channel.length / columns));
        for (let column = 0; column < columns; column++) {
          let peak = 0;
          for (let i = column * chunk; i < Math.min(channel.length, (column + 1) * chunk); i += Math.max(1, Math.floor(chunk / 300))) peak = Math.max(peak, Math.abs(channel[i]));
          peaks.push(peak);
        }
        return { duration: buffer.duration, peaks };
      } finally { await context.close(); }
    })();
    if (waveCache.size > 12) waveCache.clear();
    waveCache.set(src, result);
    result.catch(() => waveCache.delete(src));
  }
  return result;
}

function Waveform({ track, onDuration }: { track: AudioTrack; onDuration: (duration: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), [data, setData] = useState<WaveData | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setData(null); setFailed(false);
    decodeWave(track.src).then(result => { if (active) { setData(result); onDuration(result.duration); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [track.src]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const width = 360, height = 52;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#edf2ee'; ctx.fillRect(0, 0, width, height);
    if (!data) return;
    const from = track.trimStart / data.duration * width, to = track.trimEnd / data.duration * width;
    ctx.fillStyle = '#dceae1'; ctx.fillRect(from, 0, to - from, height);
    data.peaks.forEach((peak, i) => { const x = i / data.peaks.length * width; ctx.fillStyle = x >= from && x <= to ? '#507565' : '#b7c5bc'; const h = Math.max(1, peak * 45); ctx.fillRect(x, (height - h) / 2, 1.5, h); });
  }, [data, track.trimStart, track.trimEnd]);
  return <div className="audio-waveform"><canvas ref={canvas} width={360} height={52} style={{ width: '100%', height: 44, borderRadius: 5 }} aria-label={failed ? 'Waveform unavailable for this audio' : 'Audio waveform with the retained section highlighted'} />{failed && <small className="muted">Waveform unavailable. Replace this file if playback fails.</small>}</div>;
}

function makeSoundtrack(): Blob {
  const sampleRate = 22050, seconds = 12, count = sampleRate * seconds, bytes = new ArrayBuffer(44 + count * 2), view = new DataView(bytes);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  // Original procedural chord bed: sine harmonics, soft envelopes, no samples or borrowed melody.
  const chords = [[130.81, 164.81, 196], [146.83, 174.61, 220], [164.81, 196, 246.94], [130.81, 174.61, 220]];
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate, chordTime = t % 3, chord = chords[Math.min(3, Math.floor(t / 3))];
    const envelope = Math.min(1, chordTime / 0.4) * Math.min(1, (3 - chordTime) / 0.9) * Math.min(1, t) * Math.min(1, seconds - t);
    const sample = chord.reduce((sum, frequency) => sum + Math.sin(t * frequency * Math.PI * 2) * 0.065 + Math.sin(t * frequency * Math.PI * 4) * 0.013, 0) * envelope;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export function AudioPanel({ project, sceneId, edit, notify, selectedId, time }: Props) {
  const [scope, setScope] = useState<'project' | 'scene'>('project'), [kind, setKind] = useState<'music' | 'voice'>('voice');
  const [busy, setBusy] = useState(false), [recordState, setRecordState] = useState<'idle' | 'requesting' | 'recording' | 'paused' | 'saving'>('idle');
  const [voices, setVoices] = useState<Voice[]>([]), [voice, setVoice] = useState(''), [speech, setSpeech] = useState(''), [rate, setRate] = useState(0), [voiceError, setVoiceError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null), [durations, setDurations] = useState<Record<string, number>>({});
  const input = useRef<HTMLInputElement>(null), recording = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null), playback = useRef<HTMLAudioElement | null>(null), playbackFrame = useRef<number>(0), mounted = useRef(true);
  const latest = useRef({ project, sceneId }); latest.current = { project, sceneId };
  const stopPlayback = () => { cancelAnimationFrame(playbackFrame.current); playback.current?.pause(); playback.current = null; setPlayingId(null); };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    fetch('/api/voices', { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Windows voices could not be loaded.'); return response.json(); }).then((result: { voices: Voice[] }) => { setVoices(result.voices ?? []); setVoice(result.voices?.[0]?.name ?? ''); if (!result.voices?.length) setVoiceError('No Windows narration voices are installed. You can import or record narration.'); }).catch(error => { if (error.name !== 'AbortError') setVoiceError(error.message); });
    return () => {
      mounted.current = false; controller.abort(); cancelAnimationFrame(playbackFrame.current); playback.current?.pause();
      const active = recording.current;
      if (active) { active.recorder.onstop = null; active.recorder.ondataavailable = null; if (active.recorder.state !== 'inactive') active.recorder.stop(); active.stream.getTracks().forEach(track => track.stop()); recording.current = null; }
    };
  }, []);
  useEffect(() => { if (playingId && !project.audio.some(track => track.id === playingId)) stopPlayback(); }, [project.audio, playingId]);
  useEffect(() => { if (playingId) stopPlayback(); }, [time]);

  const addAudio = async (blob: Blob, name: string, options: { targetScope?: 'project' | 'scene'; targetScene?: string; targetKind?: 'music' | 'voice'; targetProject?: string } = {}) => {
    const targetProject = options.targetProject ?? latest.current.project.id;
    if (blob.size > MAX_FILE) throw new Error('Choose an audio file smaller than 20 MB.');
    if (!blob.size) throw new Error('The recording contains no audio.');
    if (latest.current.project.audio.length >= 50) throw new Error('This project already has 50 audio clips.');
    if (existingAssetBytes(latest.current.project) + blob.size > MAX_TOTAL) throw new Error('This file would exceed the project’s 40 MB media limit.');
    const src = await readDataURL(blob), wave = await decodeWave(src);
    if (!Number.isFinite(wave.duration) || wave.duration <= 0) throw new Error('The audio has no readable duration.');
    if (wave.duration > 3600) throw new Error('Choose audio shorter than one hour, then trim it to the part you need.');
    if (!mounted.current) return;
    if (latest.current.project.id !== targetProject) throw new Error('Audio was not added because you switched projects. Open the original project and try again.');
    if (latest.current.project.audio.length >= 50 || existingAssetBytes(latest.current.project) + blob.size > MAX_TOTAL) throw new Error('The project’s audio or media limit was reached while this file was loading.');
    const id = makeId(), targetScene = options.targetScene ?? latest.current.sceneId, targetScope = options.targetScope ?? scope;
    const track: AudioTrack = { id, name: name.slice(0, 280), src, kind: options.targetKind ?? kind, start: 0, trimStart: 0, trimEnd: wave.duration, volume: (options.targetKind ?? kind) === 'music' ? 0.3 : 1, fadeIn: 0, fadeOut: 0.5, ...(targetScope === 'scene' ? { sceneId: targetScene } : {}) };
    edit(next => { if (track.sceneId && !next.scenes.some(scene => scene.id === track.sceneId)) delete track.sceneId; next.audio.push(track); });
    setDurations(values => ({ ...values, [id]: wave.duration })); notify(`Added ${name}.`);
  };
  const importAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase(), types: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm' };
    const mime = types[extension ?? ''];
    if (!mime) { notify('Choose a WAV, MP3, M4A, OGG, or WebM audio file.'); return; }
    setBusy(true); try { await addAudio(new Blob([file], { type: mime }), file.name); } catch (error) { notify((error as Error).message); } finally { if (mounted.current) setBusy(false); }
  };
  const startRecording = async () => {
    if (recordState !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { notify('Microphone recording is unavailable in this browser. Import an audio file instead.'); return; }
    setRecordState('requesting');
    let acquiredStream: MediaStream | undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquiredStream = stream;
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks: Blob[] = [];
      const capturedScope = scope, capturedScene = sceneId, capturedProject = project.id; let bytes = 0;
      recording.current = { recorder, stream, chunks };
      recorder.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes > MAX_FILE && recorder.state !== 'inactive') recorder.stop(); } };
      recorder.onerror = () => { recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); recording.current = null; notify('The microphone stopped recording. Check your input device and try again.'); stream.getTracks().forEach(track => track.stop()); if (mounted.current) setRecordState('idle'); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop()); recording.current = null;
        if (!mounted.current) return; setRecordState('saving');
        try { await addAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), 'Voice recording', { targetScope: capturedScope, targetScene: capturedScene, targetKind: 'voice', targetProject: capturedProject }); } catch (error) { notify((error as Error).message); } finally { if (mounted.current) setRecordState('idle'); }
      };
      recorder.start(500); setRecordState('recording');
    } catch (error) { acquiredStream?.getTracks().forEach(track => track.stop()); recording.current = null; notify(`Microphone access failed: ${(error as Error).message}`); if (mounted.current) setRecordState('idle'); }
  };
  const toggleRecordPause = () => { const recorder = recording.current?.recorder; if (!recorder) return; if (recorder.state === 'recording') { recorder.pause(); setRecordState('paused'); } else if (recorder.state === 'paused') { recorder.resume(); setRecordState('recording'); } };
  const updateTrack = (id: string, fn: (track: AudioTrack) => void) => { stopPlayback(); edit(next => { const track = next.audio.find(item => item.id === id); if (track) fn(track); }); };
  const playTrack = async (track: AudioTrack) => {
    if (playingId === track.id) { stopPlayback(); return; }
    stopPlayback();
    const audio = new Audio(track.src); playback.current = audio; audio.volume = track.volume; audio.currentTime = track.trimStart;
    audio.onended = stopPlayback; audio.onerror = () => { notify('This audio could not be played. Replace the file with WAV, MP3, or a browser-supported format.'); stopPlayback(); };
    const tick = () => {
      if (playback.current !== audio) return;
      const elapsed = audio.currentTime - track.trimStart, remaining = track.trimEnd - audio.currentTime;
      if (remaining <= 0) { stopPlayback(); return; }
      audio.volume = clamp(track.volume) * (track.fadeIn ? clamp(elapsed / track.fadeIn) : 1) * (track.fadeOut ? clamp(remaining / track.fadeOut) : 1);
      playbackFrame.current = requestAnimationFrame(tick);
    };
    try { await audio.play(); if (playback.current !== audio) { audio.pause(); return; } setPlayingId(track.id); tick(); } catch (error) { notify(`Audio playback failed: ${(error as Error).message}`); stopPlayback(); }
  };
  const splitTrack = (track: AudioTrack) => {
    if (project.audio.length >= 50) { notify('Remove an audio clip before splitting; the limit is 50.'); return; }
    const duration = track.trimEnd - track.trimStart, elapsed = time === undefined ? duration / 2 : time - audioTrackStart(project, track), split = elapsed > 0.05 && elapsed < duration - 0.05 ? elapsed : duration / 2;
    if (duration < 0.1) { notify('This clip is too short to split.'); return; }
    stopPlayback();
    edit(next => { const index = next.audio.findIndex(item => item.id === track.id); if (index < 0) return; const current = next.audio[index], copy = { ...current, id: makeId(), name: `${current.name.slice(0, 260)} (part 2)`, start: current.start + split, trimStart: current.trimStart + split, fadeIn: 0 }; current.trimEnd = current.trimStart + split; current.fadeOut = 0; next.audio.splice(index + 1, 0, copy); });
    notify('Split the audio clip.');
  };
  const generateSpeech = async () => {
    if (!speech.trim() || !voice || busy) return;
    const targetProject = project.id, targetScene = sceneId, targetScope = scope;
    setBusy(true);
    try {
      const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: speech.trim(), voice, rate }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Narration could not be generated.'); }
      await addAudio(await response.blob(), `Narration — ${voice}`, { targetKind: 'voice', targetProject, targetScene, targetScope });
    } catch (error) { notify((error as Error).message); } finally { if (mounted.current) setBusy(false); }
  };
  return <div className="audio-panel">
    <section className="panel-section"><h3>Sound brings it together</h3><p className="muted">Import narration or music, record your voice, or use an installed Windows voice.</p>
      <div className="field-row"><label className="field">Add audio to<select value={scope} onChange={event => setScope(event.target.value as 'project' | 'scene')}><option value="project">Whole project</option><option value="scene">Current scene</option></select></label><label className="field">Track type<select value={kind} onChange={event => setKind(event.target.value as 'music' | 'voice')}><option value="voice">Narration</option><option value="music">Music</option></select></label></div>
      <input ref={input} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" hidden onChange={importAudio} />
      <button className="upload-area" disabled={busy} onClick={() => input.current?.click()}><Upload size={20} /><strong>Import an audio file</strong><small>WAV, MP3, M4A, OGG or WebM · up to 20 MB</small></button>
      <div className="field-row" style={{ marginTop: 12 }}>{recordState === 'idle' ? <button className="secondary-button" disabled={busy} onClick={startRecording}><Mic size={16} />Record your voice</button> : <><button className="secondary-button" disabled={recordState === 'requesting' || recordState === 'saving'} onClick={toggleRecordPause}>{recordState === 'paused' ? <Play size={15} /> : <Pause size={15} />}{recordState === 'paused' ? 'Resume' : recordState === 'requesting' ? 'Allow microphone…' : recordState === 'saving' ? 'Saving…' : 'Pause'}</button><button className="secondary-button" disabled={recordState === 'requesting' || recordState === 'saving'} onClick={() => recording.current?.recorder.stop()}><Square size={14} />Stop & add</button></>}</div>
      {recordState === 'recording' && <p role="status" className="muted">● Recording your microphone. Stop to add it to your story.</p>}
      <button className="small-button" style={{ marginTop: 10 }} disabled={busy} onClick={async () => { setBusy(true); try { await addAudio(makeSoundtrack(), 'Gentle chord bed', { targetKind: 'music' }); } catch (error) { notify((error as Error).message); } finally { if (mounted.current) setBusy(false); } }}><Music size={14} />Add an original gentle soundtrack</button>
    </section>
    <section className="panel-section"><h3><Volume2 size={17} /> Narration</h3>{voiceError && <p className="muted">{voiceError}</p>}
      <label className="field">Installed voice<select aria-label="Narration voice" value={voice} onChange={event => setVoice(event.target.value)} disabled={!voices.length}>{!voices.length && <option>No voices available</option>}{voices.map(item => <option key={item.name} value={item.name}>{item.name} ({item.language})</option>)}</select></label>
      <label className="field">Narration text<textarea rows={4} maxLength={12000} placeholder="Write what your audience should hear…" value={speech} onChange={event => setSpeech(event.target.value)} /></label>
      {!!project.script && <button className="small-button" onClick={() => setSpeech(project.script!.slice(0, 12000))}>Use project script</button>}
      <label className="field">Speaking speed <span>{rate === 0 ? 'Normal' : `${rate > 0 ? '+' : ''}${rate}`}</span><input aria-label="Speaking speed" type="range" min={-5} max={5} step={1} value={rate} onChange={event => setRate(Number(event.target.value))} /></label>
      <button className="primary-button" disabled={busy || !voice || !speech.trim()} onClick={generateSpeech}><Volume2 size={16} />{busy ? 'Preparing audio…' : 'Generate & add narration'}</button><small className="muted">Uses voices installed on this PC.</small>
    </section>
    <section className="panel-section"><h3>Audio clips <span className="muted">({project.audio.length})</span></h3>{!project.audio.length && <p className="muted">Your story is quiet for now. Add a clip above to get started.</p>}
      {project.audio.map(track => <article className={`audio-clip${selectedId === track.id ? ' selected' : ''}`} key={track.id} style={{ borderTop: '1px solid #dfe6e1', padding: '16px 0' }}>
        <div className="field-row" style={{ justifyContent: 'space-between' }}><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>{track.name}</strong><div style={{ display: 'flex', gap: 4 }}><button className="small-button" aria-label={playingId === track.id ? `Stop ${track.name}` : `Play ${track.name}`} onClick={() => playTrack(track)}>{playingId === track.id ? <Square size={14} /> : <Play size={14} />}</button><button className="small-button" title="Split at the playhead or midpoint" aria-label={`Split ${track.name}`} onClick={() => splitTrack(track)}><Scissors size={14} /></button><button className="small-button" aria-label={`Delete ${track.name}`} onClick={() => { stopPlayback(); edit(next => { next.audio = next.audio.filter(item => item.id !== track.id); }); }}><Trash2 size={14} /></button></div></div>
        <Waveform track={track} onDuration={duration => setDurations(values => values[track.id] === duration ? values : { ...values, [track.id]: duration })} />
        <div className="field-row"><label className="field">Starts at (s)<input aria-label={`${track.name} start`} type="number" min={0} max={600} step={0.1} value={Number(track.start.toFixed(2))} onChange={event => updateTrack(track.id, current => { current.start = clamp(Number(event.target.value), 0, 600); })} /></label><label className="field">Scope<select aria-label={`${track.name} scope`} value={track.sceneId ?? 'project'} onChange={event => updateTrack(track.id, current => { if (event.target.value === 'project') delete current.sceneId; else current.sceneId = event.target.value; })}><option value="project">Whole project</option>{project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label></div>
        <div className="field-row"><label className="field">Trim in (s)<input aria-label={`${track.name} trim in`} type="number" min={0} max={Math.max(0, track.trimEnd - 0.05)} step={0.1} value={Number(track.trimStart.toFixed(2))} onChange={event => updateTrack(track.id, current => { current.trimStart = clamp(Number(event.target.value), 0, Math.max(0, current.trimEnd - 0.05)); })} /></label><label className="field">Trim out (s)<input aria-label={`${track.name} trim out`} type="number" min={track.trimStart + 0.05} max={durations[track.id] ?? 3600} step={0.1} value={Number(track.trimEnd.toFixed(2))} onChange={event => updateTrack(track.id, current => { current.trimEnd = clamp(Number(event.target.value), current.trimStart + 0.05, durations[track.id] ?? 3600); })} /></label></div>
        <label className="field">Volume <span>{Math.round(track.volume * 100)}%</span><input aria-label={`${track.name} volume`} type="range" min={0} max={1} step={0.01} value={track.volume} onChange={event => updateTrack(track.id, current => { current.volume = Number(event.target.value); })} /></label>
        <div className="field-row"><label className="field">Fade in (s)<input aria-label={`${track.name} fade in`} type="number" min={0} max={600} step={0.1} value={track.fadeIn} onChange={event => updateTrack(track.id, current => { current.fadeIn = clamp(Number(event.target.value), 0, 600); })} /></label><label className="field">Fade out (s)<input aria-label={`${track.name} fade out`} type="number" min={0} max={600} step={0.1} value={track.fadeOut} onChange={event => updateTrack(track.id, current => { current.fadeOut = clamp(Number(event.target.value), 0, 600); })} /></label></div>
      </article>)}
    </section>
  </div>;
}
