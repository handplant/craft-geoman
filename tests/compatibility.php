<?php

// Supply the autoloader of an isolated installation containing this plugin and the target Craft version.
require $argv[1];
foreach ([
    \handplant\craftgeoman\CraftGeoman::class,
    \handplant\craftgeoman\fields\Geoman::class,
    \handplant\craftgeoman\web\GeomanAsset::class,
] as $class) {
    if (!class_exists($class)) throw new RuntimeException($class);
}
$craftSource = dirname((new ReflectionClass(\craft\base\Field::class))->getFileName(), 2);
foreach (['map', 'code', 'download', 'upload'] as $icon) {
    if (!is_file("$craftSource/icons/solid/$icon.svg")) throw new RuntimeException("Missing toolbar icon: $icon");
}
$fixtures = json_decode(file_get_contents(__DIR__ . '/fixtures/geojson.json'));
foreach ($fixtures as $fixture) {
    if (\handplant\craftgeoman\helpers\GeoJson::isValid(json_encode($fixture->value)) !== $fixture->valid) {
        throw new RuntimeException($fixture->name);
    }
}
echo "Craft API class loading, toolbar icons and shared GeoJSON fixtures passed.\n";
