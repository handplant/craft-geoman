<?php

namespace handplant\craftgeoman\fields;

use Craft;
use craft\base\Element;
use craft\base\ElementInterface;
use craft\base\Field;
use craft\helpers\Html;
use craft\helpers\StringHelper;
use handplant\craftgeoman\helpers\GeoJson;
use handplant\craftgeoman\web\GeomanAsset;
use yii\db\Schema;

class Geoman extends Field
{
    public const DEFAULT_LAT = 47.997190;
    public const DEFAULT_LON = 7.853770;
    public const DEFAULT_ZOOM = 9;
    public const DRAWING_TOOLS = [
        'drawMarker' => 'Marker',
        'drawPolyline' => 'Line',
        'drawRectangle' => 'Rectangle',
        'drawPolygon' => 'Polygon',
        'drawCircle' => 'Circle',
        'drawCircleMarker' => 'Circle marker',
        'drawText' => 'Text',
    ];
    public const DEFAULT_DRAWING_TOOLS = ['drawMarker', 'drawPolyline', 'drawRectangle', 'drawPolygon', 'drawCircle', 'drawCircleMarker'];

    public float $geomanMapLatitude = self::DEFAULT_LAT;
    public float $geomanMapLongitude = self::DEFAULT_LON;
    public int $geomanMapZoom = self::DEFAULT_ZOOM;
    public int $geomanMapHeight = 500;
    public array $geomanDrawingTools = self::DEFAULT_DRAWING_TOOLS;

    public static function displayName(): string
    {
        return Craft::t('craft-geoman', 'Geoman');
    }

    public function rules(): array
    {
        return array_merge(parent::rules(), [
            ['geomanMapLatitude', 'double', 'min' => -90, 'max' => 90],
            ['geomanMapLongitude', 'double', 'min' => -180, 'max' => 180],
            ['geomanMapZoom', 'integer', 'min' => 5, 'max' => 18],
            ['geomanMapHeight', 'integer', 'min' => 240, 'max' => 2000],
            ['geomanDrawingTools', 'each', 'rule' => ['in', 'range' => array_keys(self::DRAWING_TOOLS), 'strict' => true]],
        ]);
    }

    public static function dbType(): array|string|null
    {
        return Schema::TYPE_TEXT;
    }

    public function getContentColumnType(): string
    {
        return Schema::TYPE_TEXT;
    }

    public function normalizeValue(mixed $value, ?ElementInterface $element = null): mixed
    {
        return $value;
    }

    public function serializeValue(mixed $value, ?ElementInterface $element = null): mixed
    {
        return $value;
    }

    public function getElementValidationRules(): array
    {
        return [[function(Element $element) {
            $value = $element->getFieldValue($this->handle);
            if ($value === null || $value === '' || GeoJson::isValid($value) || $this->isStoredValue($value, $element)) {
                return;
            }
            $element->addError("field:$this->handle", Craft::t('craft-geoman', 'Enter valid, supported GeoJSON.'));
        }]];
    }

    public function isValueEmpty(mixed $value, ElementInterface $element): bool
    {
        if (parent::isValueEmpty($value, $element)) {
            return true;
        }
        if (is_string($value) && GeoJson::isValid($value)) {
            $data = json_decode($value);
            if ($data->type === 'FeatureCollection' && $data->features === []) {
                // Do not make a previously saved required field unsavable during an upgrade.
                return !$this->isStoredValue($value, $element);
            }
        }
        return false;
    }

    private function isStoredValue(mixed $value, ElementInterface $element): bool
    {
        $ids = array_unique(array_filter([$element->id, $element->getCanonicalId()]));
        foreach ($ids as $id) {
            $stored = $element::find()
                ->id($id)->siteId($element->siteId)->status(null)
                ->drafts(null)->provisionalDrafts(null)->revisions(null)->trashed(null)
                ->ignorePlaceholders()->one();
            if ($stored !== null && $stored->getFieldValue($this->handle) === $value) {
                return true;
            }
        }
        return false;
    }

    public function getSettingsHtml(): string
    {
        $toolOptions = [];
        foreach (self::DRAWING_TOOLS as $value => $label) {
            $toolOptions[] = ['value' => $value, 'label' => Craft::t('craft-geoman', $label)];
        }
        return Craft::$app->getView()->renderTemplate('craft-geoman/_components/fields/Geoman_settings', [
            'field' => $this,
            'toolOptions' => $toolOptions,
        ]);
    }

    public function getInputHtml(mixed $value, ?ElementInterface $element = null): string
    {
        return parent::getInputHtml($value, $element);
    }

    protected function inputHtml(mixed $value, ?ElementInterface $element, bool $inline): string
    {
        return $this->renderInput($value, $element, false);
    }

    public function getStaticHtml(mixed $value, ElementInterface $element): string
    {
        return $this->renderInput($value, $element, true);
    }

    public function getPreviewHtml(mixed $value, ?ElementInterface $element = null): string
    {
        return Html::tag('code', Html::encode(is_string($value) ? $value : ''));
    }

    private function renderInput(mixed $value, ?ElementInterface $element, bool $readOnly): string
    {
        $view = Craft::$app->getView();
        $asset = $view->registerAssetBundle(GeomanAsset::class);
        $id = Html::id($this->handle);
        $rootId = $id . '-geoman-' . StringHelper::randomString(8);
        return $view->renderTemplate('craft-geoman/_components/fields/Geoman_input', [
            'name' => $this->handle,
            'id' => $id,
            'rootId' => $rootId,
            'namespacedRootId' => $view->namespaceInputId($rootId),
            'value' => $value,
            'readOnly' => $readOnly,
            'height' => max(240, min(2000, $this->geomanMapHeight)),
            'options' => [
                'assetUrl' => $asset->baseUrl . '/',
                'lat' => $this->geomanMapLatitude,
                'lng' => $this->geomanMapLongitude,
                'zoom' => $this->geomanMapZoom,
                'language' => Craft::$app->getLocale()->getLanguageID(),
                'elementId' => $element?->id,
                'readOnly' => $readOnly,
                'drawingControls' => array_combine(
                    array_keys(self::DRAWING_TOOLS),
                    array_map(fn($tool) => in_array($tool, $this->geomanDrawingTools, true), array_keys(self::DRAWING_TOOLS)),
                ),
                'messages' => [
                    'textLabel' => Craft::t('craft-geoman', 'Map text'),
                    'fullscreen' => Craft::t('craft-geoman', 'Enter fullscreen'),
                    'exitFullscreen' => Craft::t('craft-geoman', 'Exit fullscreen'),
                    'tiles' => Craft::t('craft-geoman', 'Map tiles could not be loaded. Your geometry data is unchanged.'),
                    'stored' => Craft::t('craft-geoman', 'This saved value cannot be displayed as GeoJSON. It is preserved unchanged. Export it before importing a replacement.'),
                    'import' => Craft::t('craft-geoman', 'The file could not be imported. Choose valid, supported GeoJSON. Your existing data is unchanged.'),
                    'importErrors' => [
                        'json' => Craft::t('craft-geoman', 'The file does not contain valid JSON.'),
                        'type' => Craft::t('craft-geoman', 'The GeoJSON geometry type is missing or not supported.'),
                        'structure' => Craft::t('craft-geoman', 'The GeoJSON structure is invalid. Check the features, geometries, and properties.'),
                        'coordinates' => Craft::t('craft-geoman', 'Coordinates must contain at least two finite numbers per position.'),
                        'line' => Craft::t('craft-geoman', 'A line needs at least two positions.'),
                        'text' => Craft::t('craft-geoman', 'Text annotations require Point geometry and a text string.'),
                        'ringSize' => Craft::t('craft-geoman', 'A polygon ring needs at least four positions.'),
                        'ring' => Craft::t('craft-geoman', 'The polygon ring is not closed. Its first and last positions must match.'),
                    ],
                    'importLocation' => Craft::t('craft-geoman', 'Location: {path}.', ['path' => '{path}']),
                    'unchanged' => Craft::t('craft-geoman', 'Your existing data is unchanged.'),
                    'replace' => Craft::t('craft-geoman', 'Replace all existing geometry with this file?'),
                ],
            ],
        ]);
    }
}
