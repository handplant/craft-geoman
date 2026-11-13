<?php

use craft\console\Application;
use craft\elements\Entry;
use craft\web\View;
use handplant\craftgeoman\fields\Geoman;

if (!Craft::$app instanceof Application || !Craft::$app->getConfig()->getGeneral()->devMode) {
    throw new RuntimeException('Run through Craft CLI in development mode.');
}
$view = Craft::$app->getView();
$view->setTemplateMode(View::TEMPLATE_MODE_CP);
$fixtures = json_decode(file_get_contents(__DIR__ . '/fixtures/geojson.json'), false, 128, JSON_THROW_ON_ERROR);
$features = [];
foreach ($fixtures as $fixture) {
    if (!$fixture->valid || $fixture->value->type === 'FeatureCollection') continue;
    $features[] = $fixture->value->type === 'Feature' ? $fixture->value : (object)[
        'type' => 'Feature', 'properties' => (object)['fixture' => $fixture->name], 'geometry' => $fixture->value,
    ];
}
$raw = json_encode(['type' => 'FeatureCollection', 'name' => 'A & B <park> 🌍', 'features' => $features], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$raw = str_replace("\n", "\r\n", $raw);
$field = new Geoman(['name' => 'Geometry', 'handle' => 'geometry', 'geomanMapLatitude' => 0, 'geomanMapLongitude' => 0]);
$render = static function($value, $namespace, $static = false, ?Geoman $configuredField = null) use ($view, $field) {
    $target = $configuredField ?? $field;
    return $view->namespaceInputs(
        fn() => $static ? $target->getStaticHtml($value, new Entry()) : $target->getInputHtml($value),
        "fields[$namespace]",
    );
};
$html = '<form><h1>Geoman field regression fixture</h1><section id="main"><h2>Existing geometry</h2>' . $render($raw, 'main') . '</section>';
$html .= '<section id="hidden" hidden>' . $render($raw, 'hidden') . '</section>';
$html .= '<section id="invalid"><h2>Invalid legacy value</h2>' . $render('{ invalid legacy & <data>', 'invalid') . '</section>';
$html .= '<section id="empty"><h2>Empty field</h2>' . $render('', 'empty') . '</section>';
$html .= '<section id="static"><h2>Read-only</h2>' . $render($raw, 'static', true) . '</section>';
$restricted = new Geoman(['name' => 'Marker geometry', 'handle' => 'geometry', 'geomanDrawingTools' => ['drawMarker'], 'geomanMapHeight' => 750]);
$none = new Geoman(['name' => 'Existing geometry', 'handle' => 'geometry', 'geomanDrawingTools' => [], 'geomanMapHeight' => 240]);
$html .= '<section id="restricted"><h2>Marker drawing only</h2>' . $render($raw, 'restricted', false, $restricted) . '</section>';
$html .= '<section id="none"><h2>No drawing tools</h2>' . $render($raw, 'none', false, $none) . '</section>';
$textRaw = str_replace("\n", "\r\n", json_encode($fixtures[25]->value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$point = '{"type":"Feature","id":"point-only","properties":null,"geometry":{"type":"Point","coordinates":[8,48]}}';
$circles = '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"shape":"Circle","radius":100},"geometry":{"type":"Point","coordinates":[8,48]}},{"type":"Feature","properties":{"shape":"CircleMarker"},"geometry":{"type":"Point","coordinates":[8.01,48]}}]}';
foreach ([
    'markeronly' => [['drawMarker'], $point],
    'circlesonly' => [['drawCircle', 'drawCircleMarker'], $circles],
    'lineempty' => [['drawPolyline'], ''],
    'rectangleempty' => [['drawRectangle'], ''],
    'polygonempty' => [['drawPolygon'], ''],
    'textonly' => [['drawText'], $textRaw],
] as $profile => [$tools, $value]) {
    $configured = new Geoman(['name' => $profile, 'handle' => 'geometry', 'geomanDrawingTools' => $tools]);
    $html .= '<section id="' . $profile . '"><h2>' . $profile . '</h2>' . $render($value, $profile, false, $configured) . '</section>';
}
$html .= '<section id="textstatic"><h2>Read-only text</h2>' . $render($textRaw, 'textstatic', true, new Geoman(['name' => 'Text', 'handle' => 'geometry', 'geomanDrawingTools' => ['drawText']])) . '</section>';
$html .= '</form>';
$html .= '<section id="settings"><h2>Field settings</h2><form id="settings-form">' . $view->namespaceInputs(fn() => $restricted->getSettingsHtml(), 'types[geoman]') . '</form></section>';
$script = implode("\n", $view->js[View::POS_END] ?? []);
$view->js = [];
$dynamicHtml = $render($raw, 'blocks][new');
$dynamicScript = implode("\n", $view->js[View::POS_END] ?? []);
echo 'GEOMAN_FIXTURE:' . json_encode(compact('html', 'script', 'dynamicHtml', 'dynamicScript', 'raw', 'textRaw'), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
