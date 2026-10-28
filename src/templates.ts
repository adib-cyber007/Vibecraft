import { createProject, createScene, createElement, defaultAnimation, type Project, type SceneElement } from './model';
import { assetById } from './assets';

export const templates = [
  { id: 'idea', name: 'From spark to story', category: 'Explainer', color: '#e6eee8', icon: 'lightbulb', description: 'Turn your next big idea into a clear, memorable story.' },
  { id: 'lesson', name: 'Make learning stick', category: 'Education', color: '#e9edf5', icon: 'book', description: 'Introduce a topic, explain the process, and recap.' },
  { id: 'business', name: 'A better way forward', category: 'Business', color: '#f6eddd', icon: 'growth', description: 'The challenge, your solution, and the next step.' },
];
const text = (value: string, x: number, y: number, width: number, fontSize: number, start: number, color = '#25364a'): SceneElement => createElement('text', {
  name: value, text: value, x, y, width, height: fontSize * 2.8, fontFamily: 'Kalam', fontSize, fontWeight: 700, color, animation: { ...defaultAnimation(), start, draw: 1.4, hold: 1 },
});
const vector = (id: string, x: number, y: number, size: number, start: number, color = '#25364a'): SceneElement => {
  const asset = assetById[id] || Object.values(assetById)[0];
  return createElement('vector', { name: asset.name, x, y, width: size, height: size, paths: structuredClone(asset.paths), color, strokeWidth: 1.65, animation: { ...defaultAnimation(), start, draw: 2.4, hold: 1.5 } });
};
export function makeTemplate(id = 'idea'): Project {
  if (id === 'blank') return createProject({ title: 'Untitled story' });
  const learning = id === 'lesson', business = id === 'business';
  const project = createProject({ title: learning ? 'Make learning stick' : business ? 'A better way forward' : 'From spark to story' });
  project.scenes = [
    createScene(1920, 1080, { name: learning ? 'Start with curiosity' : business ? 'See the challenge' : 'Every great story starts with a spark', duration: 9,
      elements: [
        text(learning ? 'Start with a little curiosity.' : business ? 'There is a better way.' : 'Big ideas begin\nwith a little spark.', 160, 200, 1050, 105, 0),
        vector(learning ? 'book' : business ? 'target' : 'lightbulb', 1280, 240, 430, 1.8),
        text(learning ? 'Make something complicated feel simple.' : business ? 'Make room for your next breakthrough.' : 'Give yours a story worth watching.', 190, 650, 1100, 46, 4.5, '#507565'),
        createElement('shape', { name: 'Story underline', shape: 'line', x: 230, y: 610, width: 680, height: 2, color: '#e5b647', strokeWidth: 9, animation: { ...defaultAnimation(), start: 4, draw: 0.7, hand: 'marker' } }),
      ] }),
    createScene(1920, 1080, { name: learning ? 'Connect the dots' : business ? 'Build the solution' : 'Make the complicated feel simple', duration: 10, background: '#f6f9f6',
      elements: [
        text(learning ? 'Connect the dots.' : business ? 'Turn a plan into progress.' : 'One idea. Three simple steps.', 280, 90, 1360, 88, 0),
        vector('target', 200, 350, 300, 1.1), vector('puzzle', 800, 350, 300, 3), vector('rocket', 1410, 350, 300, 5),
        text('Find your focus', 90, 710, 520, 50, 2.2), text('Make it clear', 695, 710, 520, 50, 4.3), text('Bring it to life', 1310, 710, 520, 50, 6.4),
        createElement('shape', { name: 'Connect first step', shape: 'arrow', x: 555, y: 480, width: 150, height: 30, color: '#9eada5', animation: { ...defaultAnimation(), start: 2.8, draw: 0.7, hand: 'none' } }),
        createElement('shape', { name: 'Connect second step', shape: 'arrow', x: 1160, y: 480, width: 150, height: 30, color: '#9eada5', animation: { ...defaultAnimation(), start: 4.8, draw: 0.7, hand: 'none' } }),
      ] }),
    createScene(1920, 1080, { name: 'Your story starts here', duration: 8,
      elements: [
        vector(learning ? 'graduation' : 'rocket', 750, 130, 350, 0),
        text(learning ? 'A lesson they will remember.' : business ? 'Ready for your next chapter?' : 'Your story starts here.', 180, 550, 1560, 100, 2),
        text('Make it yours. Then share it with the world.', 400, 750, 1120, 44, 4, '#507565'),
      ] }),
  ];
  project.script = project.scenes.map(s => s.name).join('\n\n');
  return project;
}
