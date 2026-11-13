import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GeojsonError, parseGeojson, validGeojson } from '../resources/src/geojson.mjs';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/geojson.json', import.meta.url)));
for (const fixture of fixtures) {
  test(fixture.name, () => {
    assert.equal(validGeojson(fixture.value), fixture.valid);
    const text = JSON.stringify(fixture.value);
    if (fixture.valid) assert.deepEqual(parseGeojson(text), fixture.value);
    else assert.throws(() => parseGeojson(text));
  });
}
test('invalid JSON and non-finite coordinates', () => {
  assert.throws(() => parseGeojson('{broken'));
  assert.throws(() => parseGeojson('{"type":"Point","coordinates":[1e999,0]}'));
});
for (const [name, text, code, path] of [
  ['JSON syntax', '{broken', 'json', '$'],
  ['missing type', '{"hello":"world"}', 'type', '$.type'],
  ['unsupported geometry', '{"type":"Feature","geometry":{"type":"Sphere"}}', 'type', '$.geometry.type'],
  ['invalid feature list', '{"type":"FeatureCollection","features":{}}', 'structure', '$.features'],
  ['invalid nested coordinate', '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,"bad"]}}]}', 'coordinates', '$.features[0].geometry.coordinates[1]'],
  ['short line', '{"type":"LineString","coordinates":[[0,0]]}', 'line', '$.coordinates'],
  ['invalid annotation text', '{"type":"Feature","properties":{"shape":"Text","text":42},"geometry":{"type":"Point","coordinates":[8,48]}}', 'text', '$.properties.text'],
  ['invalid annotation geometry', '{"type":"Feature","properties":{"shape":"Text","text":"Area"},"geometry":{"type":"LineString","coordinates":[[8,48],[9,49]]}}', 'text', '$.geometry'],
  ['short ring', '{"type":"Polygon","coordinates":[[[0,0],[1,0],[0,0]]]}', 'ringSize', '$.coordinates[0]'],
  ['unclosed ring', '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1]]]}', 'ring', '$.coordinates[0]'],
]) {
  test(`Specific import error: ${name}`, () => {
    assert.throws(() => parseGeojson(text), (error) => error instanceof GeojsonError && error.code === code && error.path === path);
  });
}
test('recursive input is bounded', () => {
  const value = { type: 'GeometryCollection', geometries: [] };
  value.geometries.push(value);
  assert.equal(validGeojson(value), false);
});
