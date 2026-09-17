import { mkdir, copyFile, writeFile } from 'node:fs/promises';

// Publish only the game runtime, never local reports or historical prototypes.
const files = [
  'index.html', 'style.css',
  'src/app.js', 'src/engine.js', 'src/gestures.js', 'src/render.js',
  'assets/brush.ttf', 'assets/FONT-LICENSE.txt',
  'assets/spirit-forest.png', 'assets/spirit-atlas.png',
];
for (const file of files) {
  const destination = `_site/${file}`;
  await mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
  await copyFile(file, destination);
}
await writeFile('_site/.nojekyll', '');
console.log(`GitHub Pages 已准备：${files.length} 个运行文件 → _site/`);
