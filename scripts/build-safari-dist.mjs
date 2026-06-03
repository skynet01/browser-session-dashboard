import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const safariDistDir = path.join(root, 'store-packages', 'safari-extension');
const manifestPath = path.join(safariDistDir, 'manifest.json');

await rm(safariDistDir, { recursive: true, force: true });
await mkdir(path.dirname(safariDistDir), { recursive: true });
await cp(distDir, safariDistDir, { recursive: true });

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

manifest.permissions = (manifest.permissions ?? []).filter((permission) => permission !== 'browsingData');
delete manifest.incognito;
delete manifest.background?.type;

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Prepared Safari WebExtension resources at ${safariDistDir}`);
