import Alpine from "alpinejs";
import intersect from "@alpinejs/intersect";
import "@alenaksu/json-viewer";
const checkGeojson = require("geojson-validation");
const checkJson = function (json) {
	try {
		return JSON.parse(json);
	} catch (err) {
		return false;
	}
};

Alpine.plugin(intersect);

Alpine.data("geoman", () => ({
	map: null,
	viewer: null,
	uploader: null,
	showViewer: false,
	geojson: null,
	init() {
		this.viewer = this.$refs.viewer;
		this.uploader = this.$refs.uploadField;
	},
	initMap(lat, lng, zoom) {
		// Init map
		const tiles = L.tileLayer(
			"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
			{
				maxZoom: 19,
				attribution:
					'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
			}
		);

		this.map = L.map(this.$refs["geoman-map"], {
			tap: false,
			pmIgnore: false,
			fullscreenControl: true,
		})
			.setView([lat, lng], zoom)
			.addLayer(tiles);

		this.map.pm.setLang("en");
		this.map.pm.addControls({
			drawText: false,
		});
		this.map.pm.setPathOptions({
			color: "purple",
			fillColor: "purple",
			fillOpacity: 0.4,
		});

		// Add geojson from db
		if (this.$refs.textarea.innerHTML.trim()) {
			this.importGeojson(this.$refs.textarea.innerHTML);
		}

		// Add events to existing layer
		this.map.pm.getGeomanLayers().forEach((layer) => {
			this.setEvents(layer);
		});

		// Add events to new layer
		this.map.on("pm:create", (e) => {
			this.setGeojson();
			this.setEvents(e.layer);
		});
		this.map.on("pm:remove", (e) => {
			this.setGeojson();
		});
	},
	setEvents(layer) {
		layer.on("pm:edit", (x) => {
			this.setGeojson();
		});
	},
	importGeojson(geojson) {
		const isJson = checkJson(geojson);

		if (!isJson) {
			alert("There seems to be something wrong with your json file!");
			return false;
		}

		// const isGeojson = checkGeojson.valid(JSON.parse(geojson));

		// if (!isGeojson) {
		// 	alert("There seems to be something wrong with your geoJSON file!");
		// 	return false;
		// }

		// Add geojson from db or file to map
		this.resetMap();

		this.geoJsonLayer = L.geoJSON(JSON.parse(geojson), {
			pmIgnore: false,
			pointToLayer: (feature, latlng) => {
				// console.log(feature)
				if (feature.properties.radius) {
					return new L.Circle(latlng, feature.properties.radius);
				} else if (feature.properties.shape == "CircleMarker") {
					return new L.CircleMarker(latlng);
				} else {
					return new L.Marker(latlng);
				}
				return;
			},
		}).addTo(this.map);

		if (this.geoJsonLayer.getLayers().length) {
			this.map.fitBounds(this.geoJsonLayer.getBounds());
		}

		this.setGeojson();
	},
	setGeojson() {
		// Create geojson with circle
		const geojson = {
			type: "FeatureCollection",
			features: [],
		};
		const geomanLayers = this.map.pm.getGeomanLayers();
		for (let i = 0; i < geomanLayers.length; i++) {
			const json = geomanLayers[i].toGeoJSON();

			if (geomanLayers[i] instanceof L.Circle) {
				json.properties.shape = "Circle";
				json.properties.radius = geomanLayers[i].getRadius();
			}
			if (geomanLayers[i] instanceof L.CircleMarker) {
				json.properties.shape = "CircleMarker";
			}
			geojson.features.push(json);
		}

		this.geojson = JSON.stringify(geojson);
		this.viewer.data = geojson;
		this.viewer.expandAll();
	},
	resetMap() {
		// Remove all layers from map
		const layers = this.map.pm.getGeomanDrawLayers(true);
		if (layers) {
			layers.eachLayer(function (layer) {
				layer.remove();
			});
		}
		if (this.geoJsonLayer) {
			this.geoJsonLayer.eachLayer(function (layer) {
				layer.remove();
			});
		}
	},
	changeUploadField(event) {
		// Get geojson file
		let isBoss = confirm("Are u sure? Existing data will be overwritten!");

		let file = event.target.files[0];
		let reader = new FileReader();
		if (isBoss && file) {
			reader.readAsText(file);
		}
		reader.onload = (event) => {
			this.importGeojson(event.target.result);
			event.target.value = "";
		};
	},
	download(elementId) {
		// Download geojson as file
		const a = document.createElement("a");
		const file = new Blob([this.geojson], { type: "text/plain" });
		a.href = URL.createObjectURL(file);
		a.download = "geoman-" + elementId + ".json";
		a.click();
	},
	upload() {
		this.uploader.click();
	},
}));
Alpine.start();
