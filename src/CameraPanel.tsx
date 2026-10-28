import { useMemo, useState } from 'react';
import { Camera as CameraIcon, Copy, Lock, Maximize, Pin, Plus, Target, Trash2, Unlock } from 'lucide-react';
import { makeId, type Camera, type CameraKeyframe, type Project, type Scene } from './model';
import { cameraKeyframeEnd, clamp, sceneDuration, sceneStart, sortedCameraKeyframes } from './engine/timeline';
import type { Edit } from './Stage';
import { Field, IconButton, NumberField } from './ui';

interface Props {
  project: Project;
  sceneId: string;
  edit: Edit;
  notify: (message: string) => void;
  time?: number;
  onSeek?: (time: number) => void;
  onView?: (camera: Camera) => void;
  view?: Camera;
}

const timestamp = (value: number): string => `${value.toFixed(1)}s`;

/** Cameras are scene-local destinations; editing a destination also shows its view on the stage. */
export function CameraPanel({ project, sceneId, edit, notify, time, onSeek, onView, view }: Props) {
  const scene = project.scenes.find(candidate => candidate.id === sceneId) ?? project.scenes[0];
  const initialId = useMemo(makeId, [scene.id]);
  const [selectedId, setSelectedId] = useState<string>();
  const startingFrame: CameraKeyframe = { id: initialId, name: 'Camera 1', start: 0, duration: 0, pause: 0, camera: { ...scene.camera }, easing: 'none', locked: false, pinned: false };
  const frames = scene.cameras?.length ? sortedCameraKeyframes(scene) : [startingFrame];
  const selected = frames.find(frame => frame.id === selectedId) ?? frames[0];
  const first = selected.id === frames[0].id;
  const materialize = (target: Scene): CameraKeyframe[] => {
    if (!target.cameras?.length) target.cameras = [{ ...startingFrame, camera: { ...target.camera } }];
    return target.cameras;
  };
  const select = (frame: CameraKeyframe) => {
    setSelectedId(frame.id);
    edit(draft => { draft.scenes.find(candidate => candidate.id === scene.id)!.camera = { ...frame.camera }; }, false);
    onView?.({ ...frame.camera });
    onSeek?.(sceneStart(project, scene.id) + frame.start);
  };
  const update = (change: (frame: CameraKeyframe) => void) => {
    const next = structuredClone(selected);
    change(next);
    if (first) next.start = 0;
    edit(draft => {
      const target = draft.scenes.find(candidate => candidate.id === scene.id)!;
      const frame = materialize(target).find(candidate => candidate.id === next.id)!;
      Object.assign(frame, next);
      target.camera = { ...next.camera };
    });
    onView?.({ ...next.camera });
  };
  const geometry = (change: Partial<Camera>) => {
    if (!selected.locked) update(frame => { frame.camera = { ...frame.camera, ...change }; });
  };
  const add = (duplicate = false) => {
    if (frames.length >= 100) { notify('A scene can contain up to 100 cameras.'); return; }
    const start = clamp(duplicate ? cameraKeyframeEnd(selected) : time === undefined ? sceneDuration(scene) : time - sceneStart(project, scene.id), 0, 599);
    const frame: CameraKeyframe = duplicate
      ? { ...structuredClone(selected), id: makeId(), name: `${selected.name.slice(0, 295)} copy`, start, duration: Math.min(selected.duration, 600 - start), pause: 0, locked: false }
      : { id: makeId(), name: `Camera ${frames.length + 1}`, start, duration: 1, pause: 0, camera: { ...(view ?? scene.camera) }, easing: 'ease-out', locked: false, pinned: false };
    edit(draft => {
      const target = draft.scenes.find(candidate => candidate.id === scene.id)!;
      materialize(target).push(frame);
      target.camera = { ...frame.camera };
    });
    setSelectedId(frame.id);
    onView?.({ ...frame.camera });
    onSeek?.(sceneStart(project, scene.id) + frame.start);
    notify(duplicate ? 'Camera duplicated.' : time === undefined ? 'Camera added at the end of the scene.' : 'Camera added at the playhead.');
  };
  const remove = () => {
    if (first) return;
    const remaining = frames.filter(frame => frame.id !== selected.id), next = remaining[0];
    edit(draft => {
      const target = draft.scenes.find(candidate => candidate.id === scene.id)!;
      target.cameras = materialize(target).filter(frame => frame.id !== selected.id);
      target.camera = { ...next.camera };
    });
    setSelectedId(next.id);
    onView?.({ ...next.camera });
    notify('Camera deleted.');
  };
  const fit = view ?? { x: project.width / 2, y: project.height / 2, zoom: 1 };
  const fitted = Math.abs(fit.x - selected.camera.x) < 0.01 && Math.abs(fit.y - selected.camera.y) < 0.01 && Math.abs(fit.zoom - selected.camera.zoom) < 0.0001;

  return <section className="camera-panel">
    <div className="panel-heading"><h2><CameraIcon size={17} /> Cameras</h2><IconButton icon={Plus} label="Add camera at playhead" disabled={frames.length >= 100} onClick={() => add()} /></div>
    <p className="muted camera-intro">Choose the views your story moves through. Add a camera, then set where and when it arrives.</p>
    <div className="camera-list" aria-label="Scene cameras">
      {frames.map((frame, index) => <div key={frame.id} className={`camera-row${frame.id === selected.id ? ' active' : ''}`}>
        <button className="camera-select" aria-pressed={frame.id === selected.id} aria-label={`Select ${frame.name}`} onClick={() => select(frame)}>
          <span className="camera-number"><CameraIcon size={15} />{index + 1}</span><span><strong>{frame.name}</strong><small>{index === 0 ? 'Starting view' : `${timestamp(frame.start)} · ${timestamp(frame.duration)} move`}</small></span>
          {frame.locked && <Lock size={13} aria-label="Locked" />}{frame.pinned && <Pin size={13} aria-label="Pinned" />}
        </button>
      </div>)}
    </div>
    <button className="secondary-button camera-add" onClick={() => add()} disabled={frames.length >= 100}><Plus size={15} /> Add camera</button>
    <div className="camera-settings">
      <section className="panel-section"><h3>Camera settings</h3>
        <Field label="Camera name"><input value={selected.name} maxLength={300} onChange={event => update(frame => { frame.name = event.target.value; })} /></Field>
        <div className="button-group">
          <IconButton icon={selected.locked ? Unlock : Lock} label={selected.locked ? 'Unlock camera' : 'Lock camera'} active={selected.locked} onClick={() => update(frame => { frame.locked = !frame.locked; })} />
          <IconButton icon={Pin} label={selected.pinned ? 'Unpin camera' : 'Pin camera'} active={selected.pinned} onClick={() => update(frame => { frame.pinned = !frame.pinned; })} />
          <IconButton icon={Copy} label="Duplicate camera" onClick={() => add(true)} disabled={frames.length >= 100} />
          <IconButton icon={Trash2} label={first ? 'Starting camera cannot be deleted' : 'Delete camera'} onClick={remove} disabled={first} />
        </div>
      </section>
      <section className="panel-section"><h3>Position & size</h3>
        <fieldset disabled={selected.locked} className="camera-geometry">
          <button className="secondary-button" disabled={fitted} onClick={() => geometry(fit)}><Target size={15} /> Set camera to fit current view</button>
          <div className="field-row"><NumberField label="Camera X" value={selected.camera.x} min={-100000} max={100000} onChange={x => geometry({ x })} /><NumberField label="Camera Y" value={selected.camera.y} min={-100000} max={100000} onChange={y => geometry({ y })} /></div>
          <div className="field-row"><NumberField label="Camera width" value={project.width / selected.camera.zoom} min={project.width / 20} max={project.width / 0.05} onChange={width => geometry({ zoom: clamp(project.width / width, 0.05, 20) })} /><NumberField label="Camera height" value={project.height / selected.camera.zoom} min={project.height / 20} max={project.height / 0.05} onChange={height => geometry({ zoom: clamp(project.height / height, 0.05, 20) })} /></div>
          <NumberField label="Camera zoom" value={selected.camera.zoom} min={0.05} max={20} step={0.05} onChange={zoom => geometry({ zoom })} />
        </fieldset>
        <p className="muted"><Maximize size={12} /> The camera keeps your {project.width}:{project.height} project aspect ratio.{selected.locked ? ' Unlock it to change its view.' : ''}</p>
      </section>
      <section className="panel-section"><h3>Movement & timing</h3>
        {first ? <p className="muted">The starting view stays at 0s. Its position and size can be changed.</p> : <NumberField label="Camera start (s)" value={selected.start} min={0} max={600 - selected.duration - selected.pause} step={0.1} onChange={start => update(frame => { frame.start = start; })} />}
        <Field label="Camera movement"><select value={selected.easing} onChange={event => update(frame => { frame.easing = event.target.value as CameraKeyframe['easing']; })}><option value="none">None (instant)</option><option value="ease-out">Ease out</option><option value="linear">Linear</option></select></Field>
        <div className="field-row"><NumberField label="Camera duration (s)" value={selected.duration} min={0} max={600 - selected.start - selected.pause} step={0.1} onChange={duration => update(frame => { frame.duration = duration; })} /><NumberField label="Camera pause (s)" value={selected.pause} min={0} max={600 - selected.start - selected.duration} step={0.1} onChange={pause => update(frame => { frame.pause = pause; })} /></div>
        <p className="muted">Pause holds the destination view after its move. Place the next drawing after this time on the timeline.</p>
      </section>
    </div>
  </section>;
}
