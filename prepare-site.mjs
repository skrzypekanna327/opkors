import { mkdir, copyFile } from 'node:fs/promises';

// No production build is permitted before the owner approves publication.
if (process.env.CONTEXT === 'production') {
  throw new Error('OPKORS: publikacja produkcyjna zablokowana do uzyskania zgody właścicielki.');
}
await mkdir('public', { recursive: true });
await copyFile('index.html', 'public/index.html');
await copyFile('preview.js', 'public/preview.js');
