async (page) => {
  const fixture = await page.evaluate(() => window.geomanFixture);
  let assertions = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    assertions++;
  };
  const value = (section = 'main') => page.locator(`#${section} [data-geoman-value]`).inputValue();
  const advancedTools = async (section, visible, message) => {
    check(await page.locator(`#${section} .leaflet-pm-icon-cut`).isVisible() === visible
      && await page.locator(`#${section} .leaflet-pm-icon-rotate`).isVisible() === visible, message);
  };
  await page.waitForFunction(() => document.querySelector('#main .geoman')?.geomanField?.map);
  check(await value() === fixture.raw, 'Opening the field preserves the exact stored string');
  check(await page.locator('#main [data-geoman-fit]').isEnabled(), 'Show-all is available for existing geometry');
  check(await page.locator('#main .geoman__tools [data-geoman-toggle]').count() === 1, 'GeoJSON toggle lives in the bottom toolbar');
  check(await page.locator('#main').getByRole('button', { name: 'Export', exact: true }).count() === 1 && await page.locator('#main').getByRole('button', { name: 'Import', exact: true }).count() === 1, 'Export and Import retain clear accessible text labels');
  check(await page.locator('#main .geoman__tools .geoman__button-icon[aria-hidden="true"] svg').count() === 4, 'Four native icons accompany the toolbar labels without adding screen-reader noise');
  check(await page.evaluate(() => window.L.existingLibrary === true), 'Existing global Leaflet libraries are not replaced');
  check(await value('hidden') === fixture.raw, 'An invisible field preserves its exact stored string');
  check(await page.evaluate(() => !document.querySelector('#hidden .geoman').geomanField.map), 'Hidden field is not initialized');
  check(await page.evaluate(() => new FormData(document.querySelector('form')).get('fields[hidden][geometry]')) === fixture.raw, 'Form submission includes the untouched hidden field');
  await page.evaluate(() => { document.querySelector('#hidden').hidden = false; });
  await page.locator('#hidden').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#hidden .geoman').geomanField.map);
  check(await value('hidden') === fixture.raw, 'Making a field visible does not rewrite it');
  await page.locator('#invalid').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#invalid [data-geoman-message]').textContent.length > 0);
  check(await value('invalid') === '{ invalid legacy & <data>', 'Invalid legacy data remains byte-identical');
  check(await page.evaluate(() => !document.querySelector('#invalid .geoman').geomanField.toolsEnabled), 'Invalid legacy data cannot be accidentally replaced by drawing');
  await page.locator('#static').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#static .geoman').geomanField.map);
  check(await page.locator('#static [data-geoman-upload]').count() === 0, 'Read-only view has no import button');
  check(await page.locator('#static [data-geoman-value]').isDisabled(), 'Read-only input cannot be submitted');
  await page.evaluate(() => document.querySelector('#static .geoman').geomanField.map.setView([0,120], 3, { animate: false }));
  await page.locator('#static [data-geoman-fit]').click();
  check(await page.evaluate(() => {
    const field = document.querySelector('#static .geoman').geomanField;
    return field.map.getBounds().contains(field.layers.getBounds());
  }), 'Show-all also fits a read-only map without editing it');
  await page.evaluate(() => document.querySelector('#static .geoman').geomanField.save());
  check(await value('static') === fixture.raw, 'Read-only view cannot write values');
  await page.locator('#empty').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#empty .geoman').geomanField.map);
  check(await value('empty') === '', 'Empty field remains empty');
  await advancedTools('empty', true, 'An empty field retains cut/rotate when line or polygon drawing is possible');
  await advancedTools('static', false, 'Read-only maps never show cut/rotate');
  check(await page.locator('#empty [data-geoman-fit]').isDisabled() && await page.locator('#invalid [data-geoman-fit]').isDisabled(), 'Show-all stays disabled for empty or unrenderable values');
  check(await page.evaluate(() => {
    const center = document.querySelector('#empty .geoman').geomanField.map.getCenter();
    return Math.abs(center.lat) < 0.000001 && Math.abs(center.lng) < 0.000001;
  }), 'Zero latitude and longitude are honored');

  await page.locator('#restricted [data-geoman-map]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#restricted .geoman').geomanField.map);
  check(await value('restricted') === fixture.raw, 'Restricting new drawing does not change existing geometry');
  await advancedTools('restricted', true, 'Existing lines/polygons retain cut/rotate even with marker-only drawing');
  check(Math.round((await page.locator('#restricted [data-geoman-map]').boundingBox()).height) === 750, 'The configured 750px map height is honored');
  check(await page.locator('#restricted .leaflet-pm-icon-marker').isVisible(), 'The selected marker drawing tool is visible');
  for (const icon of ['polyline', 'rectangle', 'polygon', 'circle', 'circle-marker']) {
    check(!await page.locator(`#restricted .leaflet-pm-icon-${icon}`).isVisible(), `Unselected ${icon} drawing tool is hidden`);
  }
  check(await page.evaluate(() => {
    const field = document.querySelector('#restricted .geoman').geomanField;
    const polygon = field.map.pm.getGeomanLayers().find((layer) => layer.feature?.geometry?.type === 'Polygon');
    polygon.pm.enable();
    const editable = polygon.pm.enabled();
    polygon.pm.disable();
    const coordinates = polygon.getLatLngs();
    coordinates[0][0].lat += 0.01;
    polygon.setLatLngs(coordinates);
    polygon.fire('pm:edit');
    return editable && field.layers.toGeoJSON(false).features.length === JSON.parse(window.geomanFixture.raw).features.length;
  }), 'Non-selected existing polygon shapes remain editable and all features remain present');
  check(await value('restricted') !== fixture.raw, 'Editing an existing non-selected geometry still saves normally');

  await page.locator('#none [data-geoman-map]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#none .geoman').geomanField.map);
  check(await value('none') === fixture.raw, 'An empty drawing-tool selection also preserves existing geometry');
  await advancedTools('none', true, 'Existing linear geometry retains cut/rotate with no drawing tools');
  for (const icon of ['marker', 'polyline', 'rectangle', 'polygon', 'circle', 'circle-marker']) {
    check(!await page.locator(`#none .leaflet-pm-icon-${icon}`).isVisible(), `No-tool field hides ${icon} drawing`);
  }
  check(await page.evaluate(() => {
    const field = document.querySelector('#none .geoman').geomanField;
    const bounds = field.map.getContainer().getBoundingClientRect();
    return [...field.map.getContainer().querySelectorAll('.leaflet-top .leaflet-control')]
      .every((control) => control.getBoundingClientRect().bottom < bounds.bottom - 15);
  }), 'A small configured height expands enough to keep every toolbar control reachable');
  await page.evaluate(() => { window.noneConfirm = window.confirm; window.confirm = () => true; });
  const pointImport = '{"type":"Point","coordinates":[8,48]}';
  await page.locator('#none [data-geoman-file]').setInputFiles({ name: 'point.json', mimeType: 'application/json', buffer: Buffer.from(pointImport) });
  await page.waitForFunction((text) => document.querySelector('#none [data-geoman-value]').value === text, pointImport);
  check(await value('none') === pointImport && !await page.locator('#none .leaflet-pm-icon-marker').isVisible(), 'Import works with no drawing tools without re-enabling them');
  await advancedTools('none', false, 'Replacing all linear geometry with a point hides cut/rotate when drawing is disabled');
  const emptyImport = '{"type":"FeatureCollection","features":[]}';
  await page.locator('#none [data-geoman-file]').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(emptyImport) });
  await page.waitForFunction((text) => document.querySelector('#none [data-geoman-value]').value === text, emptyImport);
  check(await page.locator('#none [data-geoman-fit]').isDisabled(), 'Importing an empty collection disables show-all again');
  await advancedTools('none', false, 'An empty field without drawing tools keeps cut/rotate hidden');
  await page.evaluate(() => { window.confirm = window.noneConfirm; });

  for (const [profile, visible] of [['markeronly', false], ['circlesonly', false], ['lineempty', true], ['rectangleempty', true], ['polygonempty', true]]) {
    const stored = await value(profile);
    await page.locator(`#${profile} [data-geoman-map]`).scrollIntoViewIfNeeded();
    await page.waitForFunction((id) => document.querySelector(`#${id} .geoman`).geomanField.map, profile);
    await advancedTools(profile, visible, `Cut/rotate match the geometry capabilities of ${profile}`);
    check(await value(profile) === stored, 'Automatic tool visibility does not rewrite the stored value');
    check(await page.locator(`#${profile} .leaflet-pm-icon-edit`).isVisible()
      && await page.locator(`#${profile} .leaflet-pm-icon-drag`).isVisible()
      && await page.locator(`#${profile} .leaflet-pm-icon-delete`).isVisible(), 'Edit, drag, and removal remain available');
  }

  const importedPolygon = '{"type":"Feature","id":"old-area","properties":{"name":"Existing area"},"geometry":{"type":"Polygon","coordinates":[[[8,48],[8.01,48],[8.01,48.01],[8,48.01],[8,48]]]}}';
  const importProfile = async (text) => {
    await page.locator('#markeronly [data-geoman-file]').setInputFiles({ name: 'geometry.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForFunction((expected) => document.querySelector('#markeronly [data-geoman-value]').value === expected
      && !document.querySelector('#markeronly [data-geoman-upload]').disabled, text);
  };
  await page.evaluate(() => { window.profileConfirm = window.confirm; window.confirm = () => true; });
  await page.locator('#markeronly [data-geoman-map]').scrollIntoViewIfNeeded();
  await importProfile(importedPolygon);
  await advancedTools('markeronly', true, 'Importing a polygon reveals cut/rotate in a marker-only field');
  check(!await page.locator('#markeronly .leaflet-pm-icon-polygon').isVisible(), 'Automatic editing controls do not re-enable hidden drawing tools');
  await page.evaluate(() => document.querySelector('#markeronly .geoman').geomanField.map.pm.enableGlobalCutMode());
  await importProfile(pointImport);
  await advancedTools('markeronly', false, 'Importing a point removes cut/rotate again');
  check(await page.evaluate(() => !document.querySelector('#markeronly .geoman').geomanField.map.pm.globalCutModeEnabled()), 'Replacement does not leave a hidden cut mode running');

  await importProfile(importedPolygon);
  const wholeCut = await page.evaluate(() => {
    const field = document.querySelector('#markeronly .geoman').geomanField;
    field.map.pm.enableGlobalCutMode();
    const bounds = field.map.getContainer().getBoundingClientRect();
    return [[47.999,7.999],[47.999,8.011],[48.011,8.011],[48.011,7.999],[47.999,7.999]].map((latlng) => {
      const point = field.map.latLngToContainerPoint(latlng);
      return { x: bounds.x + point.x, y: bounds.y + point.y };
    });
  });
  for (const point of wholeCut) await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => JSON.parse(document.querySelector('#markeronly [data-geoman-value]').value).features?.length === 0);
  await advancedTools('markeronly', false, 'Cutting away the final polygon hides cut/rotate');
  check(await page.evaluate(() => !document.querySelector('#markeronly .geoman').geomanField.map.pm.globalCutModeEnabled()), 'Cut mode ends safely when the final eligible geometry is cut away');

  const mixed = JSON.stringify({ type: 'FeatureCollection', features: [JSON.parse(importedPolygon), { type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [8,48] } }] });
  await importProfile(mixed);
  await page.evaluate(() => {
    const field = document.querySelector('#markeronly .geoman').geomanField;
    field.map.pm.enableGlobalRotateMode();
    field.map.pm.enableGlobalRemovalMode();
    field.root.querySelector('.leaflet-pm-icon-delete').closest('[role="button"]').focus();
    field.map.pm.getGeomanLayers().find((layer) => layer.feature?.id === 'old-area').fire('click');
  });
  await advancedTools('markeronly', false, 'Deleting the final polygon while retaining a marker hides cut/rotate');
  check(await page.evaluate(() => {
    const field = document.querySelector('#markeronly .geoman').geomanField;
    return !field.map.pm.globalRotateModeEnabled() && field.map.pm.globalRemovalModeEnabled()
      && document.activeElement.contains(field.root.querySelector('.leaflet-pm-icon-delete'));
  }), 'Visibility updates stop hidden rotation, preserve removal mode, and restore keyboard focus');
  check(JSON.parse(await value('markeronly')).features.length === 1 && await page.locator('#markeronly .leaflet-marker-icon').count() === 1, 'Automatic toolbar changes preserve the remaining marker without leaving rotation handles behind');
  await page.evaluate(() => { window.confirm = window.profileConfirm; });

  await page.locator('#settings').scrollIntoViewIfNeeded();
  const settingsTools = page.locator('#settings input[type="checkbox"]');
  check(await settingsTools.count() === 7 && await page.locator('#settings input[type="checkbox"]:checked').count() === 1, 'Native field settings show seven drawing options and retain the selection');
  check(await page.evaluate(() => new FormData(document.querySelector('#settings-form')).getAll('types[geoman][geomanDrawingTools][]').join(',')) === 'drawMarker', 'The selected drawing tool is submitted with the native settings namespace');
  await page.locator('#settings input[type="checkbox"]:checked').focus();
  await page.keyboard.press('Space');
  check(await page.evaluate(() => {
    const data = new FormData(document.querySelector('#settings-form'));
    return data.getAll('types[geoman][geomanDrawingTools][]').length === 0 && data.get('types[geoman][geomanDrawingTools]') === '';
  }), 'Deselecting all tools submits the native empty-array sentinel');
  const heightInput = page.locator('#settings input[name="types[geoman][geomanMapHeight]"]');
  for (const [height, valid] of [['239', false], ['240', true], ['2000', true], ['2001', false]]) {
    await heightInput.fill(height);
    check(await heightInput.evaluate((input) => input.checkValidity()) === valid, `Native height validation handles ${height}px`);
  }
  await heightInput.fill('750');

  await page.locator('#main').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    window.fitChangeCount = 0;
    field.input.addEventListener('change', () => { window.fitChangeCount++; });
    field.map.setView([0,120], 3, { animate: false });
  });
  await page.locator('#main [data-geoman-fit]').focus();
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    return field.map.getBounds().contains(field.layers.getBounds()) && window.fitChangeCount === 0;
  }) && await value() === fixture.raw, 'Keyboard show-all restores the full extent without a value change or autosave event');
  await page.locator('#main a[title="Enter fullscreen"]').click();
  await page.waitForFunction(() => document.fullscreenElement !== null);
  check(await page.locator('#main a[title="Exit fullscreen"]').count() === 1, 'Fullscreen mode opens with an accessible exit control');
  await page.locator('#main a[title="Exit fullscreen"]').click();
  await page.waitForFunction(() => document.fullscreenElement === null);
  await page.evaluate(() => document.querySelector('#main .geoman').geomanField.tiles.fire('tileerror'));
  check(await page.locator('#main [data-geoman-message]').isVisible() && await value() === fixture.raw, 'Tile failures leave geometry intact and show a message');
  await page.evaluate(() => document.querySelector('#main .geoman').geomanField.showMessage(''));
  await page.locator('#main [data-geoman-toggle]').focus();
  await page.keyboard.press('Enter');
  check(await page.locator('#main [data-geoman-toggle]').getAttribute('aria-expanded') === 'true', 'Viewer opens using the keyboard');
  await page.keyboard.press('Space');
  check(await page.locator('#main [data-geoman-toggle]').getAttribute('aria-expanded') === 'false', 'Viewer closes using the keyboard');
  const before = await value();
  check(await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    const editButton = field.root.querySelector('.leaflet-pm-icon-edit').closest('[role="button"]');
    const circles = field.map.pm.getGeomanLayers().filter((layer) => layer.feature?.properties?.shape === 'Circle');
    if (!circles.some((layer) => layer.getRadius() === 0)) throw new Error('Zero-radius circle was not restored');
    if (!circles.some((layer) => layer.getRadius() === 75)) throw new Error('Legacy numeric string radius was not restored');
    circles.find((layer) => layer.getRadius() > 0).setRadius(200);
    circles.find((layer) => layer.getRadius() > 0).fire('pm:edit');
    return editButton === field.root.querySelector('.leaflet-pm-icon-edit').closest('[role="button"]');
  }), 'Ordinary geometry edits do not unnecessarily recreate toolbar buttons');
  const edited = JSON.parse(await value());
  check(edited.name === 'A & B <park> 🌍', 'Collection metadata and special characters survive editing');
  check(edited.features.some((f) => f.properties?.radius === 200 && f.properties.shape === 'Circle'), 'Circle edits preserve the legacy radius format');
  check(edited.features.some((f) => f.geometry.type === 'MultiPoint' && f.id === 12 && f.properties.name === 'Together'), 'MultiPoint grouping, IDs, and properties survive editing');
  check(edited.features.some((f) => f.geometry.coordinates?.[0] === 7.123456789), 'Coordinates are not rounded to six decimal places');
  check(await value('hidden') === fixture.raw, 'Editing one instance leaves the other unchanged');

  const upload = async (content) => {
    await page.locator('#main [data-geoman-file]').setInputFiles({ name: 'test.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(content) });
    await page.waitForFunction(() => {
      const field = document.querySelector('#main .geoman').geomanField;
      return !document.querySelector('#main [data-geoman-upload]').disabled && !field.map?._animatingZoom && !field.map?._panAnim?._inProgress;
    });
  };
  const saved = await value();
  await upload('{broken');
  check(await value() === saved, 'Malformed JSON import preserves existing data');
  check((await page.locator('#main [data-geoman-message]').innerText()).includes('does not contain valid JSON'), 'Malformed JSON gets a specific syntax message');
  await upload('{"hello":"world"}');
  check(await value() === saved, 'Non-GeoJSON import preserves existing data');
  check((await page.locator('#main [data-geoman-message]').innerText()).includes('type is missing or not supported'), 'Missing GeoJSON type gets a specific type message');
  for (const [text, reason, path] of [
    ['{"type":"FeatureCollection","features":{}}', 'structure is invalid', '$.features'],
    ['{"type":"Feature","geometry":{"type":"Point","coordinates":[0,"bad"]}}', 'finite numbers', '$.geometry.coordinates[1]'],
    ['{"type":"LineString","coordinates":[[0,0]]}', 'at least two positions', '$.coordinates'],
    ['{"type":"Polygon","coordinates":[[[0,0],[1,0],[0,0]]]}', 'at least four positions', '$.coordinates[0]'],
    ['{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1]]]}', 'ring is not closed', '$.coordinates[0]'],
  ]) {
    await upload(text);
    const message = await page.locator('#main [data-geoman-message]').innerText();
    check(message.includes(reason) && message.includes(path), `Specific import message identifies ${path}`);
    check(await value() === saved, 'A detailed validation failure never changes existing data');
  }
  let nestedInvalid = { type: 'Point', coordinates: ['bad', 0] };
  for (let index = 0; index < 32; index++) nestedInvalid = { type: 'GeometryCollection', geometries: [nestedInvalid] };
  await upload(JSON.stringify(nestedInvalid));
  await page.setViewportSize({ width: 390, height: 900 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Long nested GeoJSON error paths wrap without mobile overflow');
  check(await value() === saved, 'Deeply nested invalid imports preserve existing geometry');
  await page.setViewportSize({ width: 1440, height: 900 });
  check(await page.locator('#main [data-geoman-file]').inputValue() === '', 'File input resets after a failed import');
  const imported = '{ "type": "Feature", "id": "import-1", "properties": null, "geometry": { "type": "Point", "coordinates": [8, 48] } }';
  await page.evaluate(() => { window.originalConfirm = window.confirm; window.confirm = () => false; });
  await upload(imported);
  check(await value() === saved, 'Canceling replacement keeps the original data');
  await page.evaluate(() => { window.confirm = () => true; });
  await upload(imported);
  await page.evaluate(() => { window.confirm = window.originalConfirm; });
  check(await value() === imported, 'Import accepts null properties and preserves source formatting');
  await advancedTools('main', true, 'A point import retains cut/rotate when new linear drawing is still possible');
  await page.evaluate(() => document.querySelector('#main .geoman').geomanField.map.pm.enableGlobalDragMode());
  const marker = page.locator('#main .leaflet-marker-icon').first();
  const box = await marker.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((initial) => document.querySelector('#main [data-geoman-value]').value !== initial, imported);
  check(JSON.parse(await value()).features[0].id === 'import-1', 'Dragging an imported marker saves it and preserves its ID');
  check(await page.locator('#main .leaflet-marker-icon').evaluate((image) => image.complete && image.naturalWidth > 0), 'Marker image loads from local plugin assets');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#main [data-geoman-download]').click();
  const download = await downloadPromise;
  await download.saveAs('/tmp/geoman-step1-download.json');
  check(download.suggestedFilename() === 'geoman-new.json', 'Unsaved elements have a safe download filename');
  await page.evaluate(() => { window.confirm = () => true; });
  const polygon = JSON.stringify({ type: 'Feature', id: 'cut-me', properties: { name: 'Keep & preserve' }, geometry: { type: 'Polygon', coordinates: [[[8,48],[8.01,48],[8.01,48.01],[8,48.01],[8,48]]] } });
  await upload(polygon);
  const cutPoints = await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    field.map.pm.enableGlobalCutMode();
    const bounds = field.map.getContainer().getBoundingClientRect();
    return [[48.004,7.999],[48.004,8.011],[48.006,8.011],[48.006,7.999],[48.004,7.999]].map((latlng) => {
      const point = field.map.latLngToContainerPoint(latlng);
      return { x: bounds.x + point.x, y: bounds.y + point.y };
    });
  });
  for (const point of cutPoints) await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => JSON.parse(document.querySelector('#main [data-geoman-value]').value).features?.[0]?.geometry.type === 'MultiPolygon');
  const cutFeature = JSON.parse(await value()).features[0];
  check(cutFeature.geometry.coordinates.length === 2 && cutFeature.properties.name === 'Keep & preserve' && cutFeature.id === 'cut-me', 'Real cut interaction saves both parts and preserves properties and ID');
  const cutValue = await value();
  await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    field.map.pm.disableGlobalCutMode();
    field.map.pm.getGeomanLayers()[0].fire('pm:edit');
  });
  check(await value() === cutValue, 'Resulting cut layers have working edit listeners');
  await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    field.map.pm.enableGlobalRemovalMode();
    field.map.pm.getGeomanLayers()[0].fire('click');
  });
  check(JSON.parse(await value()).features.length === 0, 'Removal mode removes the deleted geometry from the saved collection');
  check(await page.locator('#main [data-geoman-fit]').isDisabled(), 'Deleting the last geometry disables show-all');
  const drawPoint = await page.evaluate(() => {
    const field = document.querySelector('#main .geoman').geomanField;
    field.map.pm.disableGlobalRemovalMode();
    field.map.pm.enableDraw('Marker');
    const bounds = field.map.getContainer().getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  });
  await page.mouse.click(drawPoint.x, drawPoint.y);
  await page.evaluate(() => document.querySelector('#main .geoman').geomanField.map.pm.disableDraw());
  check(JSON.parse(await value()).features.length === 1, 'Drawing a new marker updates the native field value');
  check(await page.locator('#main [data-geoman-fit]').isEnabled(), 'Drawing a geometry re-enables show-all');
  await page.waitForFunction(() => document.querySelector('#main .leaflet-marker-icon')?.complete);
  check(await page.locator('#main .leaflet-marker-icon').evaluate((image) => image.complete && image.naturalWidth > 0), 'Newly drawn markers also load their local icon');
  await page.evaluate(() => { window.confirm = window.originalConfirm; });
  const reopenedValue = await value();
  await page.evaluate(() => {
    const wrapper = document.createElement('section');
    wrapper.id = 'dynamic';
    wrapper.innerHTML = window.geomanFixture.dynamicHtml;
    document.querySelector('form').append(wrapper);
  });
  await page.locator('#dynamic [data-geoman-value]').evaluate((input, stored) => { input.value = stored; }, reopenedValue);
  await page.addScriptTag({ content: fixture.dynamicScript });
  await page.locator('#dynamic').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#dynamic .geoman').geomanField.map);
  check(await value('dynamic') === reopenedValue, 'Reopening edited geometry in a dynamic namespaced field preserves its saved value');
  check(await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    return new Set(ids).size === ids.length;
  }), 'Multiple and dynamic fields have unique IDs');
  await page.evaluate(() => {
    window.removedGeoman = document.querySelector('#dynamic .geoman').geomanField;
    document.querySelector('#dynamic').remove();
  });
  await page.waitForFunction(() => window.removedGeoman.map._container._leaflet_id === undefined);
  assertions++;

  await page.locator('#main').scrollIntoViewIfNeeded();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No page overflow at ${width}px`);
    check(await page.evaluate(() => {
      const root = document.querySelector('#main .geoman');
      return root.querySelector('[data-geoman-toggle]').getBoundingClientRect().top >= root.querySelector('[data-geoman-map]').getBoundingClientRect().bottom;
    }), `GeoJSON control stays below the map at ${width}px`);
    check(await page.evaluate(() => [...document.querySelectorAll('#main .geoman__button-icon svg')].every((icon) => {
      const size = icon.getBoundingClientRect();
      return size.width > 0 && size.width <= 20 && size.height > 0 && size.height <= 20;
    })), `Toolbar icons have bounded visible sizes at ${width}px`);
    check(await page.locator('#main .btngroup').evaluate((group) => {
      const buttons = [...group.children].map((button) => button.getBoundingClientRect());
      return buttons.slice(1).every((button, index) => Math.abs(button.left - buttons[index].right) <= 1);
    }), `Native button group has no added gaps at ${width}px`);
    await page.screenshot({ path: `/tmp/geoman-enhancements-${width}.png` });
    await page.locator('#settings').scrollIntoViewIfNeeded();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Settings have no page overflow at ${width}px`);
    await page.screenshot({ path: `/tmp/geoman-settings-${width}.png` });
    await page.locator('#main').scrollIntoViewIfNeeded();
  }
  const noJsContext = await page.context().browser().newContext({ javaScriptEnabled: false });
  const noJsPage = await noJsContext.newPage();
  await noJsPage.setContent(fixture.html);
  check(await noJsPage.locator('#main [data-geoman-value]').inputValue() === fixture.raw, 'Without JavaScript, saved input remains unchanged');
  check(await noJsPage.locator('#main [data-geoman-download]').isDisabled(), 'Without JavaScript, unavailable actions stay disabled');
  check(await noJsPage.locator('#main [data-geoman-fit]').isDisabled(), 'Without JavaScript, show-all is disabled too');
  await noJsContext.close();
  check(before === fixture.raw, 'Initial value was not normalized');
  return { assertions, finalValue: await value(), hiddenValue: await value('hidden') };
}
