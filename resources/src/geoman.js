import { L } from './leaflet.mjs';
import 'leaflet/dist/leaflet.css';
import 'leaflet.fullscreen';
import 'leaflet.fullscreen/dist/Control.FullScreen.css';
import '@alenaksu/json-viewer';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { GeojsonError, parseGeojson } from './geojson.mjs';
import './geoman.css';

require('@geoman-io/leaflet-geoman-free');
require('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css');

const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });

class GeomanField {
  constructor(id, options) {
    this.root = document.getElementById(id);
    if (!this.root || this.root.geomanField) return;
    this.root.geomanField = this;
    this.options = options;
    const assetUrl = new URL(options.assetUrl, window.location.href);
    L.Icon.Default.mergeOptions({
      imagePath: assetUrl.href,
      iconUrl: markerIcon,
      iconRetinaUrl: markerIcon2x,
      shadowUrl: markerShadow,
    });
    this.input = this.root.querySelector('[data-geoman-value]');
    this.viewer = this.root.querySelector('json-viewer');
    this.message = this.root.querySelector('[data-geoman-message]');
    this.uploadInput = this.root.querySelector('[data-geoman-file]');
    this.toggle = this.root.querySelector('[data-geoman-toggle]');
    this.fitButton = this.root.querySelector('[data-geoman-fit]');
    this.fitButton.addEventListener('click', () => this.fitBounds());
    this.root.querySelector('[data-geoman-download]').addEventListener('click', () => this.download());
    this.toggle.addEventListener('click', () => {
      this.viewer.hidden = !this.viewer.hidden;
      this.toggle.setAttribute('aria-expanded', String(!this.viewer.hidden));
      this.updateViewer();
      if (!this.viewer.hidden) this.viewer.expandAll();
    });
    if (this.uploadInput) {
      this.root.querySelector('[data-geoman-upload]').addEventListener('click', () => this.uploadInput.click());
      this.uploadInput.addEventListener('change', () => this.upload());
    }
    this.root.querySelectorAll('[data-geoman-action]').forEach((button) => { button.disabled = false; });
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.observer.disconnect();
        this.initMap();
      }
    });
    this.observer.observe(this.root.querySelector('[data-geoman-map]'));
    this.removalObserver = new MutationObserver(() => {
      if (!this.root.isConnected) this.destroy();
    });
    this.removalObserver.observe(document.body, { childList: true, subtree: true });
  }

  initMap() {
    if (this.map) return;
    this.map = L.map(this.root.querySelector('[data-geoman-map]'), {
      fullscreenControl: true,
      fullscreenControlOptions: {
        title: this.options.messages.fullscreen,
        titleCancel: this.options.messages.exitFullscreen,
      },
    }).setView([this.options.lat, this.options.lng], this.options.zoom);
    this.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.tiles.on('tileerror', () => this.showMessage(this.options.messages.tiles));
    this.layers = L.featureGroup().addTo(this.map);
    this.source = emptyCollection();
    const text = this.input.value;
    this.restoring = true;
    try {
      if (text.trim()) {
        this.source = parseGeojson(text);
        const prepared = this.prepare(this.source);
        this.addPrepared(prepared);
        this.fitBounds();
      }
      this.enableTools();
    } catch {
      this.showMessage(this.options.messages.stored);
    } finally {
      this.restoring = false;
    }
    this.updateFitButton();
    this.map.on('pm:create', ({ layer }) => {
      this.layers.addLayer(layer);
      this.bindLayer(layer);
      this.save();
    });
    this.map.on('pm:remove', () => {
      this.pruneLayers(this.layers);
      this.save();
    });
    this.map.on('pm:cut', ({ layer, originalLayer }) => {
      this.inheritFeature(layer, originalLayer.feature);
      this.removeLayer(this.layers, originalLayer);
      this.layers.addLayer(layer);
      this.bindLayer(layer);
      this.save();
    });
    this.resizeObserver = new ResizeObserver(() => this.resizeMap());
    this.resizeObserver.observe(this.root.querySelector('[data-geoman-map]'));
  }

  enableTools() {
    if (this.options.readOnly || this.toolsEnabled) return;
    this.toolsEnabled = true;
    this.map.pm.setLang(this.options.language, 'en');
    this.map.pm.setPathOptions({ color: 'purple', fillColor: 'purple', fillOpacity: 0.4 });
    this.updateEditingControls();
  }

  updateEditingControls() {
    if (!this.toolsEnabled) return;
    const drawing = this.options.drawingControls ?? {};
    // Leaflet's Polyline class also covers rectangles and polygons, but not circles.
    const relevant = ['drawPolyline', 'drawRectangle', 'drawPolygon'].some((tool) => drawing[tool] !== false)
      || this.map.pm.getGeomanLayers().some((layer) => layer instanceof L.Polyline);
    if (this.linearToolsVisible === relevant) return;
    this.linearToolsVisible = relevant;
    if (!relevant) {
      if (this.map.pm.globalCutModeEnabled()) this.map.pm.disableGlobalCutMode();
      if (this.map.pm.globalRotateModeEnabled()) this.map.pm.disableGlobalRotateMode();
    }
    const container = this.map.getContainer();
    const focusedTitle = container.contains(document.activeElement)
      ? document.activeElement.closest('.button-container[title]')?.getAttribute('title')
      : null;
    this.map.pm.addControls({
      ...drawing, drawText: drawing.drawText === true,
      editMode: true, dragMode: true, removalMode: true,
      cutPolygon: relevant, rotateMode: relevant,
    });
    // Geoman rebuilds all toolbar buttons when visibility changes.
    if (focusedTitle) {
      const replacement = [...container.querySelectorAll('.button-container[title]')]
        .find((button) => button.getAttribute('title') === focusedTitle)?.querySelector('[role="button"]');
      (replacement ?? container).focus({ preventScroll: true });
    }
    this.resizeMap();
  }

  prepare(data) {
    const group = L.geoJSON(data, {
      pmIgnore: false,
      pointToLayer: (feature, latlng) => {
        const properties = feature.properties ?? {};
        if (properties.shape === 'Text') {
          return L.marker(latlng, { textMarker: true, text: properties.text });
        }
        const radius = properties.radius;
        const hasRadius = typeof radius === 'number' || (typeof radius === 'string' && radius !== '');
        if ((properties.shape === 'Circle' || radius) && hasRadius && Number.isFinite(Number(radius)) && Number(radius) >= 0) {
          return L.circle(latlng, { radius: Number(radius) });
        }
        return properties.shape === 'CircleMarker' ? L.circleMarker(latlng) : L.marker(latlng);
      },
    });
    group.eachLayer((layer) => this.bindLayer(layer));
    return group;
  }

  addPrepared(group) {
    group.getLayers().forEach((layer) => {
      group.removeLayer(layer);
      this.layers.addLayer(layer);
    });
  }

  bindLayer(layer) {
    if (layer instanceof L.LayerGroup) {
      layer.eachLayer((child) => this.bindLayer(child));
    } else {
      layer.off('pm:edit pm:textchange', this.onEdit, this);
      layer.on('pm:edit pm:textchange', this.onEdit, this);
      if (layer.options.textMarker) layer.pm.getElement().setAttribute('aria-label', this.options.messages.textLabel);
      if (this.options.readOnly) layer.pm?.setOptions({ allowEditing: false, draggable: false, allowRemoval: false, allowCutting: false, allowRotation: false });
    }
  }

  onEdit() { this.save(); }

  inheritFeature(layer, feature) {
    if (!feature) return;
    const result = layer.toGeoJSON(false);
    if (result.type === 'FeatureCollection') {
      layer.eachLayer((child) => this.inheritFeature(child, feature));
    } else {
      // Geoman's cut result omits the original feature's properties and ID.
      layer.feature = { ...feature, geometry: result.geometry };
    }
  }

  removeLayer(group, target) {
    group.eachLayer((layer) => {
      if (layer === target) group.removeLayer(layer);
      else if (layer instanceof L.LayerGroup) this.removeLayer(layer, target);
    });
  }

  pruneLayers(group) {
    group.eachLayer((layer) => {
      if (layer instanceof L.LayerGroup) this.pruneLayers(layer);
      if (!this.map.hasLayer(layer) || (layer instanceof L.LayerGroup && !layer.getLayers().length)) group.removeLayer(layer);
    });
  }

  save() {
    if (this.options.readOnly || this.restoring || !this.root.isConnected) return;
    const annotate = (group) => group.eachLayer((layer) => {
      if (layer instanceof L.LayerGroup) annotate(layer);
      else if (layer.options.textMarker) {
        layer.feature ??= layer.toGeoJSON(false);
        layer.feature.properties ??= {};
        layer.feature.properties.shape = 'Text';
        layer.feature.properties.text = layer.pm.getText();
      } else if (layer instanceof L.CircleMarker) {
        layer.feature ??= layer.toGeoJSON(false);
        layer.feature.properties ??= {};
        layer.feature.properties.shape = layer instanceof L.Circle ? 'Circle' : 'CircleMarker';
        if (layer instanceof L.Circle) layer.feature.properties.radius = layer.getRadius();
      }
    });
    annotate(this.layers);
    const collection = this.layers.toGeoJSON(false);
    const value = this.source.type === 'FeatureCollection' ? { ...this.source, features: collection.features } : collection;
    const serialized = JSON.stringify(value);
    if (this.input.value !== serialized) {
      this.input.value = serialized;
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
      this.input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.updateFitButton();
    this.updateViewer();
    this.updateEditingControls();
  }

  resizeMap() {
    const container = this.map.getContainer();
    const controls = [...container.querySelectorAll('.leaflet-top .leaflet-control')];
    const height = Math.max(240, ...controls.map((control) => control.offsetTop + control.offsetHeight + 24));
    const minHeight = `${height}px`;
    if (container.style.minHeight !== minHeight) container.style.minHeight = minHeight;
    this.map.invalidateSize({ pan: true, animate: false });
  }

  updateFitButton() {
    this.fitButton.disabled = !this.layers.getBounds().isValid();
  }

  fitBounds() {
    const bounds = this.layers.getBounds();
    if (bounds.isValid()) this.map.fitBounds(bounds, { maxZoom: 19, animate: false });
  }

  async upload() {
    const file = this.uploadInput.files[0];
    if (!file) return;
    const button = this.root.querySelector('[data-geoman-upload]');
    button.disabled = true;
    try {
      const text = await file.text();
      const data = parseGeojson(text);
      if (!this.root.isConnected) return;
      this.initMap();
      // Build the replacement off-map. A failed import never clears existing layers.
      const prepared = this.prepare(data);
      if (this.input.value.trim() && !window.confirm(this.options.messages.replace)) return;
      this.restoring = true;
      try {
        this.map.pm.disableDraw();
        this.map.pm.disableGlobalEditMode();
        this.map.pm.disableGlobalDragMode();
        this.map.pm.disableGlobalRemovalMode();
        this.map.pm.disableGlobalCutMode();
        this.map.pm.disableGlobalRotateMode();
        this.layers.clearLayers();
        this.addPrepared(prepared);
        this.source = data;
        this.enableTools();
        this.updateEditingControls();
      } finally {
        this.restoring = false;
      }
      // Keep imported metadata and precision intact until an actual geometry edit.
      this.input.value = text;
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
      this.input.dispatchEvent(new Event('change', { bubbles: true }));
      this.showMessage('');
      this.updateFitButton();
      this.fitBounds();
      this.updateViewer();
    } catch (error) {
      const reason = error instanceof GeojsonError && this.options.messages.importErrors[error.code];
      this.showMessage(reason
        ? `${reason} ${this.options.messages.importLocation.replace('{path}', error.path)} ${this.options.messages.unchanged}`
        : this.options.messages.import);
    } finally {
      this.uploadInput.value = '';
      button.disabled = false;
    }
  }

  updateViewer() {
    if (this.viewer.hidden) return;
    try { this.viewer.data = JSON.parse(this.input.value || JSON.stringify(emptyCollection())); }
    catch { this.viewer.data = this.input.value; }
  }

  showMessage(text) {
    this.message.textContent = text;
    this.message.hidden = !text;
  }

  download() {
    const url = URL.createObjectURL(new Blob([this.input.value || JSON.stringify(emptyCollection())], { type: 'application/geo+json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `geoman-${this.options.elementId ?? 'new'}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  destroy() {
    this.observer.disconnect();
    this.resizeObserver?.disconnect();
    this.removalObserver?.disconnect();
    this.map?.remove();
  }
}

window.Craft ??= {};
window.Craft.GeomanField = GeomanField;
