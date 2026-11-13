const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export class GeojsonError extends Error {
  constructor(code, path = '$') {
    super(`${code}: ${path}`);
    this.name = 'GeojsonError';
    this.code = code;
    this.path = path;
  }
}

function requireValue(condition, code, path) {
  if (!condition) throw new GeojsonError(code, path);
}

function array(value, path, minimum = 0, code = 'coordinates') {
  requireValue(Array.isArray(value), code, path);
  requireValue(value.length >= minimum, code, path);
}

function position(value, path) {
  array(value, path, 2);
  value.forEach((number, index) => requireValue(typeof number === 'number' && Number.isFinite(number), 'coordinates', `${path}[${index}]`));
}

function line(value, path) {
  array(value, path);
  requireValue(value.length >= 2, 'line', path);
  value.forEach((point, index) => position(point, `${path}[${index}]`));
}

function ring(value, path) {
  array(value, path);
  requireValue(value.length >= 4, 'ringSize', path);
  value.forEach((point, index) => position(point, `${path}[${index}]`));
  requireValue(JSON.stringify(value[0]) === JSON.stringify(value[value.length - 1]), 'ring', path);
}

function polygon(value, path) {
  array(value, path, 1);
  value.forEach((points, index) => ring(points, `${path}[${index}]`));
}

function validate(value, depth, path) {
  requireValue(depth <= 64, 'structure', path);
  requireValue(object(value), 'type', path);
  const geometry = (child, childPath) => {
    requireValue(object(child) && !['Feature', 'FeatureCollection'].includes(child.type), 'type', childPath);
    validate(child, depth + 1, childPath);
  };
  const coordinatesPath = `${path}.coordinates`;
  switch (value.type) {
    case 'FeatureCollection':
      array(value.features, `${path}.features`, 0, 'structure');
      value.features.forEach((feature, index) => {
        const featurePath = `${path}.features[${index}]`;
        requireValue(feature?.type === 'Feature', 'structure', featurePath);
        validate(feature, depth + 1, featurePath);
      });
      break;
    case 'Feature':
      requireValue(value.properties === undefined || value.properties === null || object(value.properties), 'structure', `${path}.properties`);
      if (value.properties?.shape === 'Text') {
        requireValue(value.geometry?.type === 'Point', 'text', `${path}.geometry`);
        requireValue(typeof value.properties.text === 'string', 'text', `${path}.properties.text`);
      }
      geometry(value.geometry, `${path}.geometry`);
      break;
    case 'GeometryCollection':
      array(value.geometries, `${path}.geometries`, 0, 'structure');
      value.geometries.forEach((child, index) => geometry(child, `${path}.geometries[${index}]`));
      break;
    case 'Point': position(value.coordinates, coordinatesPath); break;
    case 'LineString': line(value.coordinates, coordinatesPath); break;
    case 'Polygon': polygon(value.coordinates, coordinatesPath); break;
    case 'MultiPoint':
    case 'MultiLineString':
    case 'MultiPolygon': {
      array(value.coordinates, coordinatesPath, 1);
      const validateCoordinates = { MultiPoint: position, MultiLineString: line, MultiPolygon: polygon }[value.type];
      value.coordinates.forEach((coordinates, index) => validateCoordinates(coordinates, `${coordinatesPath}[${index}]`));
      break;
    }
    default: throw new GeojsonError('type', `${path}.type`);
  }
}

export function validGeojson(value, depth = 0) {
  try {
    validate(value, depth, '$');
    return true;
  } catch (error) {
    if (error instanceof GeojsonError) return false;
    throw error;
  }
}

export function parseGeojson(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new GeojsonError('json'); }
  validate(value, 0, '$');
  return value;
}
