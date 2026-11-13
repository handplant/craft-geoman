# Frontend example

Load Leaflet's CSS and JavaScript through your site's asset pipeline; Geoman is not needed. Replace `geoman` with your field handle.

```twig
<div id="map" role="region" aria-label="Map" data-geojson="{{ entry.geoman|e('html_attr') }}"></div>

<style>
  #map { height: clamp(260px, 50vh, 500px); }
  .geoman-text-label { width: max-content; padding: 3px 6px; background: #fff; color: #222; white-space: pre; }
</style>
```

Run after the markup and Leaflet have loaded:

```js
const container = document.getElementById('map');
const map = L.map(container).setView([0, 0], 2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

const layer = L.geoJSON(JSON.parse(container.dataset.geojson || 'null'), {
  pointToLayer(feature, latlng) {
    const { shape, radius, text } = feature.properties ?? {};
    if (shape === 'Text' && typeof text === 'string') {
      const label = document.createElement('span');
      label.textContent = text;
      return L.marker(latlng, {
        icon: L.divIcon({ className: 'geoman-text-label', html: label, iconSize: null, iconAnchor: [0, 0] }),
      });
    }
    const hasRadius = typeof radius === 'number' || (typeof radius === 'string' && radius !== '');
    if ((shape === 'Circle' || radius) && hasRadius && Number.isFinite(Number(radius)) && Number(radius) >= 0) {
      return L.circle(latlng, { radius: Number(radius) });
    }
    return shape === 'CircleMarker' ? L.circleMarker(latlng) : L.marker(latlng);
  },
}).addTo(map);

if (layer.getBounds().isValid()) {
  map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 16 });
}
```

Supports standard geometry, circles, and plain-text labels. An empty field shows the world map; malformed legacy JSON must be corrected first. Keep the attribute escaping and use `textContent`, never imported text as HTML.

OpenStreetMap's [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies.
