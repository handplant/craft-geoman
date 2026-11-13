# Craft Geoman Changelog

## 3.0.0 - 2026-11-13

### Added

- Optional Text drawing with multiline Unicode support, live field-value updates while typing, and import/export. Text is stored as a Point with `shape` and `text` properties and rendered as plain text.
- Per-field drawing-tool selection. Existing fields retain the original six tools; Text is opt-in. Existing geometry and imports remain unrestricted.
- Map-height setting (240–2000px, default 500px), with automatic expansion to keep the toolbar accessible.
- **Show all geometry** action, also available on read-only maps, without changing the field value.
- Localized import errors with the GeoJSON path to the problem.
- Shared JS/PHP fixtures and browser regression tests.
- Separate [upgrade](docs/UPGRADING.md) and [frontend](docs/FRONTEND.md) guides.

### Changed

- Bundle Leaflet 1.9.4, Leaflet-Geoman Free 2.20.6, Leaflet Fullscreen 5.3.3, and JSON Viewer 2.1.2 locally instead of using CDNs.
- Replace Laravel Mix and Alpine with esbuild and native Craft field initialization; isolate Leaflet from other plugins and include dependency licenses.
- Use the control-panel language, native form controls, English/German messages, accessible GeoJSON toggling, and read-only maps.
- Move GeoJSON to the bottom toolbar alongside **Export / Import**, with native Craft icons.
- Show Cut and Rotate only when enabled drawing tools or existing geometry support them; retain Edit, Move, and Delete.
- Refresh the SVG plugin icon and control-panel mask; update screenshots and include them in the README.

### Fixed

- Preserve raw saved values on load, including hidden/dynamic fields, CRLF line endings, malformed legacy data, and no-JavaScript forms.
- Validate new/changed GeoJSON server-side while allowing unchanged legacy values and previously saved empty required collections.
- Validate imports before replacing data; handle null properties, cancelled/failed/repeated imports, and active drawing modes safely.
- Save drawing, imported edits, cuts, deletion, and text changes reliably. Preserve IDs, properties, Multi geometry grouping, polygon holes, and coordinate precision where the operation permits.
- Honor zero latitude/longitude and map height; avoid duplicate DOM IDs and clean up removed maps/listeners.
- Use the current OpenStreetMap tile endpoint with attribution and recoverable tile errors.
- Fix local marker assets, case-sensitive build paths, and documentation links.

Existing package/field identifiers, settings, raw GeoJSON strings, and Circle/CircleMarker storage remain compatible. No data migration or bulk resave is required; see the [upgrade notes](docs/UPGRADING.md).

## 2.0.0 - 2024-12-09

### Changed

- Updated to Craft 5

## 1.0.1 - 2023-04-11

### Fixed

- Fixed a case error

## 1.0.0 - 2022-07-21

### Added

- Initial release
