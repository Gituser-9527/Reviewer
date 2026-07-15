import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await cp(new URL('../manifest.json', import.meta.url), new URL('../dist/manifest.json', import.meta.url));
await cp(new URL('../src/sidepanel/index.html', import.meta.url), new URL('../dist/sidepanel/index.html', import.meta.url));
await cp(new URL('../src/content/styles.css', import.meta.url), new URL('../dist/content/styles.css', import.meta.url));
