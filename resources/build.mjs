import { build, context } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const options = {
  entryPoints: ['src/geoman.js'],
  bundle: true,
  inject: ['src/leaflet.mjs'],
  plugins: [{
    name: 'leaflet-esm',
    setup(builder) {
      // Leaflet's default UMD entry writes window.L; use one private ESM copy instead.
      builder.onResolve({ filter: /^leaflet$/ }, () => ({ path: resolve('node_modules/leaflet/dist/leaflet-src.esm.js') }));
    },
  }],
  minify: true,
  sourcemap: false,
  legalComments: 'external',
  target: ['es2020'],
  outdir: '../src/web/dist',
  assetNames: 'images/[name]-[hash]',
  loader: { '.png': 'file', '.svg': 'file' },
};

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const licenses = [];
for (const [directory, dependency] of Object.entries(lock.packages)) {
  if (!directory || dependency.dev || dependency.optional) continue;
  const packageInfo = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((file) => file.isFile() && /^(licen[cs]e|copying|copyright)/i.test(file.name));
  const texts = await Promise.all(files.map((file) => readFile(`${directory}/${file.name}`, 'utf8')));
  licenses.push(`${packageInfo.name} ${packageInfo.version} (${packageInfo.license})\n${texts.join('\n')}`);
}
await mkdir(options.outdir, { recursive: true });
await writeFile(`${options.outdir}/THIRD-PARTY-LICENSES.txt`, licenses.join('\n\n---\n\n'));

if (process.argv.includes('--watch')) {
  await (await context(options)).watch();
} else {
  await build(options);
}
