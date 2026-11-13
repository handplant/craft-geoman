async (page) => {
  const fixture = await page.evaluate(() => window.geomanFixture);
  let assertions = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    assertions++;
  };
  const value = (section) => page.locator(`#${section} [data-geoman-value]`).inputValue();
  const labelText = JSON.parse(fixture.textRaw).properties.text;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#textonly [data-geoman-map]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#textonly .geoman').geomanField.map);
  const textArea = page.locator('#textonly textarea.pm-textarea');
  check(await value('textonly') === fixture.textRaw, 'Opening a text annotation preserves the raw field string and CRLF formatting');
  check(await textArea.inputValue() === labelText, 'Text annotations restore Unicode, multiple lines, and literal HTML');
  check(await page.locator('#textonly .leaflet-pm-icon-text').isVisible(), 'Text drawing is available when explicitly selected');
  check(!await page.locator('#main .leaflet-pm-icon-text').isVisible(), 'Existing default fields do not gain the new Text drawing button');
  check(!await page.locator('#textonly .leaflet-pm-icon-cut').isVisible() && !await page.locator('#textonly .leaflet-pm-icon-rotate').isVisible(), 'Text does not enable incompatible cut/rotate tools');
  check(await textArea.getAttribute('aria-label') === 'Map text', 'Map text has an accessible label');
  check(await page.evaluate(() => !window.geomanTextXss && !document.querySelector('#textonly img[src="x"]')), 'Annotation contents are not interpreted as HTML');

  await page.evaluate(() => {
    const field = document.querySelector('#textonly .geoman').geomanField;
    window.textChanges = 0;
    field.input.addEventListener('change', () => { window.textChanges++; });
    const layer = field.map.pm.getGeomanLayers().find((candidate) => candidate.options.textMarker);
    layer.pm.enable();
    layer.pm.focus();
  });
  const updated = 'Treffpunkt & Café 🌍\n<em>Plain text</em>';
  await textArea.fill(updated);
  const edited = JSON.parse(await value('textonly')).features[0];
  check(edited.properties.shape === 'Text' && edited.properties.text === updated, 'Typing updates the stored annotation before blur or save');
  check(edited.id === 'label-1' && edited.properties.name === 'Landmark', 'Editing text preserves feature IDs and other properties');
  check(edited.geometry.coordinates[0] === 8.123456789 && edited.geometry.coordinates[1] === 48.987654321, 'Editing text does not round its coordinates');
  const changesBeforeBlur = await page.evaluate(() => window.textChanges);
  await textArea.press('Tab');
  check(await page.evaluate(() => window.textChanges) === changesBeforeBlur, 'Blur does not emit a second unchanged field value');
  check(await page.evaluate(() => document.querySelector('#textonly .geoman').geomanField.map.dragging.enabled()), 'Leaving the text restores map dragging');

  await page.evaluate(() => {
    const field = document.querySelector('#textonly .geoman').geomanField;
    field.map.pm.disableGlobalEditMode();
    field.map.pm.enableGlobalDragMode();
  });
  const box = await textArea.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((oldLongitude) => JSON.parse(document.querySelector('#textonly [data-geoman-value]').value).features[0].geometry.coordinates[0] !== oldLongitude, edited.geometry.coordinates[0]);
  check(JSON.parse(await value('textonly')).features[0].properties.text === updated, 'Dragging a text annotation saves its position without losing its text');
  await page.evaluate(() => document.querySelector('#textonly .geoman').geomanField.map.pm.disableGlobalDragMode());

  await page.evaluate(() => {
    window.textOriginalObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      window.textExportContents = blob.text();
      return window.textOriginalObjectURL(blob);
    };
  });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#textonly [data-geoman-download]').click();
  const download = await downloadPromise;
  await download.saveAs('/tmp/geoman-text-export.json');
  const exported = await page.evaluate(() => window.textExportContents);
  await page.evaluate(() => { URL.createObjectURL = window.textOriginalObjectURL; });
  check(exported === await value('textonly'), 'Export includes the latest annotation text and coordinates');
  const renderFrontend = () => page.evaluate(async ({ source, styles, raw }) => {
    const L = await import('/frontend-leaflet.js');
    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
    const container = document.createElement('div');
    container.id = 'map';
    container.dataset.geojson = raw;
    document.body.append(container);
    const render = new Function('L', `${source}\nreturn map;`);
    const map = render(L);
    const expected = JSON.parse(raw).properties.text;
    const label = container.querySelector('.geoman-text-label');
    const safe = label?.textContent === expected && label.getBoundingClientRect().width > 0
      && !container.querySelector('img[src="x"]') && !window.geomanTextXss;
    const readable = getComputedStyle(label).backgroundColor === 'rgb(255, 255, 255)'
      && getComputedStyle(label).whiteSpace === 'pre';
    const height = container.getBoundingClientRect().height;
    const responsive = height === Math.max(260, Math.min(500, window.innerHeight / 2));
    const zoom = map.getZoom();
    map.remove();
    container.dataset.geojson = '';
    const emptyMap = render(L);
    const empty = emptyMap.getZoom() === 2;
    emptyMap.remove();
    container.dataset.geojson = JSON.stringify({ type: 'Feature', properties: { shape: 'Circle', radius: 0 }, geometry: { type: 'Point', coordinates: [8, 48] } });
    const circleMap = render(L);
    let zeroCircle = false;
    circleMap.eachLayer((layer) => { if (layer instanceof L.Circle && layer.getRadius() === 0) zeroCircle = true; });
    circleMap.remove();
    container.remove();
    style.remove();
    return { safe, readable, responsive, zoom, empty, zeroCircle };
  }, { source: fixture.frontendExample, styles: fixture.frontendStyles, raw: fixture.textRaw });
  const frontend = await renderFrontend();
  check(frontend.safe, 'The documented plain-Leaflet frontend renders text literally without needing Geoman or interpreting HTML');
  check(frontend.readable, 'The documented frontend gives multiline labels a readable background');
  check(frontend.responsive, 'The documented map uses its responsive CSS height');
  check(frontend.zoom <= 16, 'A single feature does not zoom the documented frontend beyond level 16');
  check(frontend.empty, 'An empty field renders the world map without an error');
  check(frontend.zeroCircle, 'The documented frontend preserves zero-radius circle rendering');
  await page.setViewportSize({ width: 390, height: 700 });
  const mobileFrontend = await renderFrontend();
  check(mobileFrontend.safe && mobileFrontend.readable, 'The documented frontend keeps labels safe and readable on mobile');
  check(mobileFrontend.responsive && mobileFrontend.zoom <= 16, 'The documented frontend keeps responsive height and bounded zoom on mobile');
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(() => { window.textOriginalConfirm = window.confirm; window.confirm = () => true; });
  await page.locator('#markeronly [data-geoman-file]').setInputFiles({ name: 'text.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(exported) });
  await page.waitForFunction((expected) => document.querySelector('#markeronly [data-geoman-value]').value === expected
    && !document.querySelector('#markeronly [data-geoman-upload]').disabled, exported);
  await page.locator('#markeronly [data-geoman-map]').scrollIntoViewIfNeeded();
  check(await page.locator('#markeronly textarea.pm-textarea').inputValue() === updated, 'Import restores annotations even when new Text drawing is disabled');
  check(!await page.locator('#markeronly .leaflet-pm-icon-text').isVisible() && !await page.locator('#markeronly .leaflet-pm-icon-cut').isVisible(), 'Import does not enable hidden drawing or incompatible editing tools');

  await page.locator('#textonly [data-geoman-map]').scrollIntoViewIfNeeded();
  const drawText = async (xFraction, yFraction) => {
    await page.locator('#textonly .leaflet-pm-icon-text').click();
    const mapBox = await page.locator('#textonly [data-geoman-map]').boundingBox();
    await page.mouse.click(mapBox.x + mapBox.width * xFraction, mapBox.y + mapBox.height * yFraction);
  };
  await drawText(0.25, 0.3);
  await page.waitForFunction(() => document.querySelectorAll('#textonly textarea.pm-textarea').length === 2);
  const newText = page.locator('#textonly textarea.pm-textarea').last();
  check(await newText.evaluate((input) => input === document.activeElement && !input.readOnly), 'A newly placed text annotation is focused and editable');
  await newText.fill('Neue Beschriftung\nLine 2');
  check(JSON.parse(await value('textonly')).features.some((feature) => feature.properties.text === 'Neue Beschriftung\nLine 2'), 'Text drawn through the real toolbar is saved while typing');
  await page.locator('#textonly [data-geoman-fit]').click();
  await drawText(0.75, 0.75);
  await page.waitForFunction(() => document.querySelectorAll('#textonly textarea.pm-textarea').length === 3);
  // Geoman arms its click-away cleanup 100ms after placing a new label.
  await page.waitForTimeout(150);
  await page.locator('#textonly [data-geoman-fit]').click();
  await page.waitForFunction(() => document.querySelectorAll('#textonly textarea.pm-textarea').length === 2);
  check(JSON.parse(await value('textonly')).features.length === 2, 'Leaving a new empty annotation removes it from the saved collection');

  await page.evaluate(() => {
    const field = document.querySelector('#textonly .geoman').geomanField;
    const layer = field.map.pm.getGeomanLayers().find((candidate) => candidate.feature?.id === 'label-1');
    layer.pm.enable();
    layer.pm.focus();
  });
  await page.locator('#textonly textarea.pm-textarea').first().fill('Still focused before replacement');
  await page.evaluate(() => {
    const field = document.querySelector('#textonly .geoman').geomanField;
    window.textReplacementChanges = 0;
    field.input.addEventListener('change', () => { window.textReplacementChanges++; });
    field.map.pm.enableDraw('Text');
  });
  await page.locator('#textonly [data-geoman-file]').setInputFiles({ name: 'replacement.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(fixture.textRaw) });
  await page.waitForFunction((expected) => document.querySelector('#textonly [data-geoman-value]').value === expected
    && !document.querySelector('#textonly [data-geoman-upload]').disabled, fixture.textRaw);
  check(await page.evaluate(() => window.textReplacementChanges) === 1, 'Replacing focused text emits only the final imported value, not intermediate layer states');
  check(await page.locator('#textonly textarea.pm-textarea').count() === 1 && await value('textonly') === fixture.textRaw, 'Repeated import retains exact text data without duplicate annotations');
  check(await page.evaluate(() => !document.querySelector('#textonly .geoman').geomanField.map.pm.Draw.Text.enabled()), 'Import also stops an active Text drawing mode');

  await page.locator('#textstatic [data-geoman-map]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#textstatic .geoman').geomanField.map);
  check(await page.locator('#textstatic textarea.pm-textarea').inputValue() === labelText, 'Read-only maps display annotation contents');
  check(await page.evaluate(() => {
    const field = document.querySelector('#textstatic .geoman').geomanField;
    const layer = field.map.pm.getGeomanLayers().find((candidate) => candidate.options.textMarker);
    layer.pm.enable();
    return !layer.pm.enabled() && layer.pm.getElement().readOnly;
  }) && await value('textstatic') === fixture.textRaw, 'Read-only annotations cannot enter editing or rewrite their stored value');

  await page.evaluate(() => {
    const wrapper = document.createElement('section');
    wrapper.id = 'textreopened';
    wrapper.innerHTML = window.geomanFixture.dynamicHtml;
    document.querySelector('form').append(wrapper);
  });
  await page.locator('#textreopened [data-geoman-value]').evaluate((input, stored) => { input.value = stored; }, exported);
  await page.addScriptTag({ content: fixture.dynamicScript });
  await page.locator('#textreopened').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#textreopened textarea.pm-textarea'));
  check(await page.locator('#textreopened textarea.pm-textarea').inputValue() === updated && await value('textreopened') === exported, 'Reopening exported text in a dynamic namespaced field restores it without normalization');
  await page.evaluate(() => {
    const field = document.querySelector('#textreopened .geoman').geomanField;
    field.map.pm.getGeomanLayers()[0].pm.enable();
    field.map.pm.getGeomanLayers()[0].pm.focus();
    window.removedTextField = field;
    document.querySelector('#textreopened').remove();
  });
  await page.waitForFunction(() => window.removedTextField.map._container._leaflet_id === undefined);
  assertions++;

  await page.locator('#textonly [data-geoman-map]').scrollIntoViewIfNeeded();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Text annotations do not cause page overflow at ${width}px`);
    await page.screenshot({ path: `/tmp/geoman-text-${width}.png` });
  }
  check(await page.evaluate(() => !window.geomanTextXss), 'Text stays literal after edits, export/import, and reopening');
  await page.evaluate(() => { window.confirm = window.textOriginalConfirm; });
  return { assertions };
}
