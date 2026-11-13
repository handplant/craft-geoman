import { readFileSync } from 'node:fs';

// Run in the Craft project's DDEV container; pass its absolute host path for Playwright's file routes.
const projectRoot = process.argv[2];
if (!projectRoot) throw new Error('Pass the absolute host path of the Craft project.');
const output = readFileSync(0, 'utf8');
const fixture = JSON.parse(output.split('GEOMAN_FIXTURE:')[1].trim());
const safeJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const frontendGuide = readFileSync(new URL('../docs/FRONTEND.md', import.meta.url), 'utf8');
fixture.frontendExample = frontendGuide.match(/```js\n([\s\S]*?)\n```/)[1];
fixture.frontendStyles = frontendGuide.match(/<style>\n([\s\S]*?)\n<\/style>/)[1];
const leafletSource = readFileSync(new URL('../resources/node_modules/leaflet/dist/leaflet-src.esm.js', import.meta.url), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/theme/cp.css"><link rel="stylesheet" href="/native/css/cp.css"><link rel="stylesheet" href="/assets/geoman.css">
<style>body{padding:24px;max-width:1100px;margin:auto;width:auto;box-sizing:border-box}section{margin-bottom:32px}h1{font-size:24px}h2{font-size:18px}</style>
</head><body>${fixture.html}<script>window.L={existingLibrary:true};</script><script src="/assets/geoman.js"></script><script>window.geomanFixture=${safeJson(fixture)};${fixture.script}</script></body></html>`;
const tests = readFileSync(new URL('./browser.js', import.meta.url), 'utf8');
const textTests = readFileSync(new URL('./text-browser.js', import.meta.url), 'utf8');
console.log(`async page => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const root = ${JSON.stringify(projectRoot)};
    if (url.pathname.startsWith('/cpresources/')) return route.fulfill({ path: root + '/plugins/geoman/src/web/dist/' + url.pathname.split('/').slice(3).join('/') });
    if (url.hostname === 'geoman.test') {
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: ${safeJson(html)} });
      if (url.pathname === '/frontend-leaflet.js') return route.fulfill({ contentType: 'application/javascript', body: ${safeJson(leafletSource)} });
      if (url.pathname.startsWith('/theme/')) return route.fulfill({ path: root + '/vendor/craftcms/cms/src/web/assets/theme/dist/' + url.pathname.slice(7) });
      if (url.pathname.startsWith('/native/')) return route.fulfill({ path: root + '/vendor/craftcms/cms/src/web/assets/cp/dist/' + url.pathname.slice(8) });
      if (url.pathname.startsWith('/assets/')) return route.fulfill({ path: root + '/plugins/geoman/src/web/dist/' + url.pathname.slice(8) });
    }
    // Never request OSM tiles in an automated test.
    if (url.hostname === 'tile.openstreetmap.org') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOyoAAAAASUVORK5CYII=', 'base64') });
    return route.abort();
  });
  await page.goto('https://geoman.test/');
  const result = await (${tests})(page);
  const textResult = await (${textTests})(page);
  if (errors.length) throw new Error(errors.join('\\n'));
  return { assertions: result.assertions + textResult.assertions, hiddenUnchanged: result.hiddenValue === (await page.evaluate(() => window.geomanFixture.raw)) };
}`);
