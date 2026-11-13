# Upgrading Craft Geoman

These notes cover upgrading from **2.0.0 to 3.0.0**. Back up the project and database and test in staging before deploying.

## Compatibility

- Requires Craft CMS 5.0+ within Craft 5 and PHP 8.2+.
- Package `handplant/craft-geoman`, plugin handle `craft-geoman`, field class, and field handles are unchanged.
- **No data migration or bulk resave is required.** The field still returns its raw GeoJSON string, not a PHP object or array.
- Existing map settings remain compatible. Fields without a drawing-tool selection retain their original six tools; Text is off until explicitly enabled.
- Read-only fields display maps without drawing/import controls and cannot submit changes.

## Saved values and validation

Opening a field or its GeoJSON viewer does not normalize or rewrite the value. Hidden fields and no-JavaScript forms also preserve their raw values. Unsupported or malformed saved values are preserved and can be exported with JavaScript before explicitly importing a replacement.

New or changed values are validated in the browser and on the server. An unchanged invalid value already saved on the element or its canonical element remains savable. New invalid data is rejected.

A new empty `FeatureCollection` is empty for required-field validation. Previously saved empty collections retain the old required-field behavior until changed.

## Import and geometry editing

- Import accepts a `FeatureCollection`, `Feature`, or supported geometry: Point, LineString, Polygon, their Multi variants, or GeometryCollection.
- Positions must be numeric and finite. Lines need at least two positions; polygon rings need at least four and must be closed.
- Features with null geometry and geometries with empty coordinates are not editable. Existing values containing them are preserved rather than partially loaded and lost.
- Null properties are supported. Invalid imports leave the previous data intact. Successful imports retain the file's JSON text until an actual geometry edit.
- Geometry edits produce a `FeatureCollection`. IDs, properties, collection metadata, polygon holes, Multi geometry grouping, and coordinate precision are retained where the geometry operation permits. Cut results inherit the original feature metadata.

## Circles and text

Circle storage is unchanged: a GeoJSON Point with `properties.shape = "Circle"` and `properties.radius` in meters. Legacy numeric-string radii are also read. Circle markers use `properties.shape = "CircleMarker"`. Neither is silently converted into a polygon.

The optional Text tool stores a Point with `properties.shape = "Text"` and a string `properties.text`. Multiline Unicode text is supported and treated as plain text, never HTML. Changes synchronize while typing; a newly placed empty label is removed when clicking away. Imported text is displayed even when new Text drawing is disabled.

These are GeoJSON property conventions, not new geometry types. Existing website templates are not automatically modified; use the [frontend example](FRONTEND.md) to render them.

[Back to README](../README.md)
