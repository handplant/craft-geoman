<?php

use craft\console\Application;
use craft\elements\Entry;
use craft\web\View;
use handplant\craftgeoman\fields\Geoman;
use handplant\craftgeoman\helpers\GeoJson;

if (!Craft::$app instanceof Application || !Craft::$app->getConfig()->getGeneral()->devMode) {
    throw new RuntimeException('Run through Craft CLI in development mode.');
}
$count = 0;
$check = static function(bool $condition, string $message) use (&$count): void {
    if (!$condition) throw new RuntimeException($message);
    $count++;
};
$fixtures = json_decode(file_get_contents(__DIR__ . '/fixtures/geojson.json'), false, 128, JSON_THROW_ON_ERROR);
foreach ($fixtures as $fixture) {
    $text = json_encode($fixture->value, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
    $check(GeoJson::isValid($text) === $fixture->valid, $fixture->name);
}
$check(!GeoJson::isValid('{broken') && !GeoJson::isValid('{"type":"Point","coordinates":[1e999,0]}'), 'Invalid JSON and non-finite coordinates are rejected');
$field = new Geoman(['name' => 'Geometry', 'handle' => 'geometry', 'geomanMapLatitude' => 0, 'geomanMapLongitude' => 0]);
$entry = new class extends Entry {
    public mixed $testValue = null;
    public function getFieldValue(string $fieldHandle): mixed { return $this->testValue; }
};
foreach ([null, '', '{broken', " {\n\"type\":\"FeatureCollection\",\"features\":[]} ", json_encode($fixtures[2]->value)] as $value) {
    $check($field->serializeValue($field->normalizeValue($value, $entry), $entry) === $value, 'Values round-trip byte-for-byte');
}
$validate = $field->getElementValidationRules()[0][0];
foreach (['{broken' => false, '{"type":"FeatureCollection","features":[]}' => true, '' => true] as $value => $valid) {
    $entry->testValue = $value;
    $entry->clearErrors();
    $validate($entry);
    $check(!$entry->hasErrors() === $valid, 'New values are validated');
}
$check($field->isValueEmpty('{"type":"FeatureCollection","features":[]}', $entry), 'A new empty collection is empty');
$check($field->validate(), 'Zero latitude and longitude are valid settings');
$createField = static function(array $settings): Geoman {
    $created = Craft::$app->getFields()->createField([
        'type' => Geoman::class, 'name' => 'Configured geometry', 'handle' => 'configuredGeometry', 'settings' => $settings,
    ]);
    if (!$created instanceof Geoman) throw new RuntimeException('Geoman field creation failed');
    return $created;
};
$legacySettings = $createField(['geomanMapHeight' => 500]);
$check($legacySettings->geomanDrawingTools === Geoman::DEFAULT_DRAWING_TOOLS && count($legacySettings->geomanDrawingTools) === 6 && !in_array('drawText', $legacySettings->geomanDrawingTools, true), 'Old settings retain their six drawing tools without enabling Text');
foreach ([239 => false, 240 => true, 500 => true, 2000 => true, 2001 => false] as $height => $valid) {
    $configured = $createField(['geomanMapHeight' => (string)$height]);
    $check($configured->validate() === $valid, "Map height $height is validated through Craft settings hydration");
    if (!$valid) $check($configured->hasErrors('geomanMapHeight'), 'Invalid height has an error on its settings field');
}
foreach ([[], ['drawMarker'], ['drawText'], array_keys(Geoman::DRAWING_TOOLS)] as $tools) {
    $configured = $createField(['geomanDrawingTools' => $tools]);
    $check($configured->validate() && $configured->geomanDrawingTools === $tools, 'None, one, and all tool selections are valid');
    $roundTrip = Craft::$app->getFields()->createField(Craft::$app->getFields()->createFieldConfig($configured));
    $check($roundTrip instanceof Geoman && $roundTrip->geomanDrawingTools === $tools, 'Tool selection survives a native field config round-trip');
}
$none = $createField(['geomanDrawingTools' => '']);
$check($none->geomanDrawingTools === [] && $none->validate(), 'Unchecking all native checkboxes hydrates as an empty selection');
$unknown = $createField(['geomanDrawingTools' => ['not-a-tool']]);
$check(!$unknown->validate() && $unknown->hasErrors('geomanDrawingTools'), 'Unknown drawing tools are rejected');
$view = Craft::$app->getView();
$view->setTemplateMode(View::TEMPLATE_MODE_CP);
$raw = json_encode($fixtures[2]->value, JSON_UNESCAPED_UNICODE);
$html = $view->namespaceInputs(fn() => $field->getInputHtml($raw), 'fields[blocks][one]');
$check(str_contains($html, 'name="fields[blocks][one][geometry]"'), 'Field input is namespaced');
$check(str_contains($html, '&amp;') && str_contains($html, '&lt;park&gt;') && !str_contains($html, 'x-model'), 'Input is escaped without reactive rewriting');
$check(str_contains(implode('', $view->js[View::POS_END] ?? []), '"lat":0,"lng":0'), 'Zero coordinates reach JavaScript unchanged');
$check(!str_contains($html, 'unpkg.com') && !str_contains($html, 'cdnjs.cloudflare.com'), 'No CDN scripts are rendered');
$check(strpos($html, 'data-geoman-toggle') > strpos($html, 'class="geoman__tools"'), 'GeoJSON toggle is rendered in the bottom toolbar');
$check(substr_count($html, 'class="geoman__button-icon" aria-hidden="true"') === 4, 'All four toolbar actions have decorative icons');
$check(str_contains(strip_tags($html), 'Export') && str_contains(strip_tags($html), 'Import') && !str_contains(strip_tags($html), 'Download') && !str_contains(strip_tags($html), 'Upload'), 'Visible file actions are named Export and Import');
$html2 = $field->getInputHtml($raw, new Entry());
preg_match('/<div id="([^"]+)"/', $html, $id1);
preg_match('/<div id="([^"]+)"/', $html2, $id2);
$check($id1[1] !== $id2[1], 'Repeated fields have distinct root IDs');
$check(str_contains(implode('', $view->js[View::POS_END] ?? []), json_encode($id1[1])), 'Initializer targets the actual namespaced root ID');
preg_match('/data-geoman-value value="([^"]*)"/', $html, $encodedValue);
$check(html_entity_decode($encodedValue[1], ENT_QUOTES, 'UTF-8') === $raw, 'Hidden attribute preserves the exact JSON string');
$static = $field->getStaticHtml($raw, $entry);
$check(!str_contains($static, 'data-geoman-upload') && preg_match('/data-geoman-value[^>]+ disabled/', $static) === 1, 'Static fields have no writable input or import');
$check(!str_contains($field->getPreviewHtml('<script>', $entry), '<script>'), 'Preview is escaped');
$settingsHtml = $field->getSettingsHtml();
$check(str_contains($settingsHtml, 'geomanMapLongitude'), 'Native field settings render');
$check(str_contains($settingsHtml, 'name="geomanMapHeight"') && str_contains($settingsHtml, 'min="240"') && str_contains($settingsHtml, 'max="2000"'), 'Native map-height input has matching client constraints');
$check(str_contains($settingsHtml, 'name="geomanDrawingTools[]"') && substr_count($settingsHtml, 'type="checkbox"') === 7, 'Native drawing-tool group offers all seven tools');
$check(str_contains($static, 'data-geoman-fit'), 'Read-only maps also offer show-all geometry');
$restricted = $createField(['geomanDrawingTools' => ['drawMarker'], 'geomanMapHeight' => 750]);
$restrictedHtml = $restricted->getInputHtml($raw);
$check(str_contains($restrictedHtml, 'height: 750px'), 'Configured height reaches the rendered map');
$js = implode('', $view->js[View::POS_END] ?? []);
$check(str_contains($js, '"drawMarker":true,"drawPolyline":false,"drawRectangle":false,"drawPolygon":false,"drawCircle":false,"drawCircleMarker":false'), 'Only selected drawing controls are enabled in browser options');
$check(str_contains($js, '"drawText":false'), 'Text stays disabled in existing and marker-only browser configurations');
$textField = $createField(['geomanDrawingTools' => ['drawText']]);
$textRaw = json_encode($fixtures[25]->value, JSON_UNESCAPED_UNICODE);
$textHtml = $textField->getInputHtml($textRaw);
$check(str_contains(implode('', $view->js[View::POS_END] ?? []), '"drawText":true'), 'Text can be explicitly enabled in a field');
$check(!str_contains($textHtml, '<img src=x') && !str_contains($textHtml, '<em>Plain text</em>'), 'Annotation markup stays escaped in the field HTML');
$check($textField->serializeValue($textField->normalizeValue($textRaw, $entry), $entry) === $textRaw, 'Annotation data round-trips without changing the field string contract');
$check(str_contains($js, '"ring":"The polygon ring is not closed.') && str_contains($js, 'Location: {path}.'), 'Specific import errors and location template reach browser options');
$en = require __DIR__ . '/../src/translations/en/craft-geoman.php';
$de = require __DIR__ . '/../src/translations/de/craft-geoman.php';
$check(array_keys($en) === array_keys($de), 'English and German translation keys match');
$originalLanguage = Craft::$app->language;
try {
    Craft::$app->language = 'de';
    $check(str_contains($field->getInputHtml(''), 'Import') && str_contains($field->getSettingsHtml(), 'Breitengrad'), 'German field and settings render through Craft translations');
    $germanSettings = $field->getSettingsHtml();
    $check(str_contains($germanSettings, 'Kartenhöhe') && str_contains($germanSettings, 'Zeichenwerkzeuge') && str_contains($germanSettings, 'Kreismarker'), 'New field settings are translated into German');
    $germanJs = implode('', $view->js[View::POS_END] ?? []);
    $check(str_contains($germanJs, 'Der Polygonring ist nicht geschlossen.') && str_contains($germanJs, 'Stelle: {path}.'), 'Specific import reasons and paths are translated into German');
} finally {
    Craft::$app->language = $originalLanguage;
}

// Use an existing scalar field only as a read-only stand-in for legacy stored text.
$legacyChecked = false;
foreach (Entry::find()->status(null)->limit(20)->all() as $stored) {
    foreach ($stored->getFieldLayout()->getCustomFields() as $nativeField) {
        $value = $stored->getFieldValue($nativeField->handle);
        if (!is_string($value) || $value === '' || GeoJson::isValid($value)) continue;
        $legacy = new Geoman(['name' => 'Legacy', 'handle' => $nativeField->handle]);
        $validateLegacy = $legacy->getElementValidationRules()[0][0];
        $copy = clone $stored;
        $copy->clearErrors();
        $validateLegacy($copy);
        $check(!$copy->hasErrors(), 'Unchanged invalid stored text remains savable');
        $copy->setFieldValue($nativeField->handle, '{changed invalid GeoJSON');
        $validateLegacy($copy);
        $check($copy->hasErrors(), 'Changed invalid stored text is rejected');
        $legacyChecked = true;
        break 2;
    }
}
if (!$legacyChecked) echo "SKIP: no existing scalar content for the legacy-value integration check.\n";
echo "Geoman: $count read-only assertions passed.\n";
