import * as THREE from 'three';
import { GLOBE } from '@/config/constants';

// ============================================================================
// SHARED GEOGRAPHIC UTILITIES
// Single source of truth for all coordinate conversions and predictions
// ============================================================================

// Pre-allocated vectors for internal calculations (avoid GC in hot paths)
const _tempVec3 = new THREE.Vector3();

/**
 * Convert latitude/longitude/altitude to 3D position on a unit sphere
 * 
 * @param lat - Latitude in degrees (-90 to 90)
 * @param lon - Longitude in degrees (-180 to 180)
 * @param altitude - Altitude in feet (optional, defaults to 0)
 * @param radius - Base sphere radius (optional, defaults to 1)
 * @returns THREE.Vector3 position
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  altitude: number = 0,
  radius: number = 1
): THREE.Vector3 {
  const r = radius + altitude * GLOBE.ALTITUDE_SCALE;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Convert latitude/longitude to 3D position, writing to an existing Vector3
 * Use this in render loops to avoid allocations
 * 
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param altitude - Altitude in feet
 * @param radius - Base sphere radius
 * @param target - Vector3 to write result into
 * @returns The target Vector3 (for chaining)
 */
export function latLonToVector3Into(
  lat: number,
  lon: number,
  altitude: number,
  radius: number,
  target: THREE.Vector3
): THREE.Vector3 {
  const r = radius + altitude * GLOBE.ALTITUDE_SCALE;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  
  target.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
  
  return target;
}

/**
 * Get orientation quaternion for an object at a lat/lon facing a heading
 * 
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param heading - Heading in degrees (0 = north, 90 = east)
 * @returns THREE.Quaternion orientation
 */
export function getOrientationAtLatLon(
  lat: number,
  lon: number,
  heading: number
): THREE.Quaternion {
  const position = latLonToVector3(lat, lon, 0);
  
  // Up is radial direction (away from globe center)
  const up = position.clone().normalize();
  
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  
  // North vector (direction of increasing latitude along the surface)
  const north = new THREE.Vector3(
    Math.sin(latRad) * Math.cos(lonRad + Math.PI),
    Math.cos(latRad),
    -Math.sin(latRad) * Math.sin(lonRad + Math.PI)
  ).normalize();
  
  // Make north perpendicular to up (project onto tangent plane)
  north.sub(up.clone().multiplyScalar(north.dot(up))).normalize();
  
  // East vector (perpendicular to both up and north)
  const east = new THREE.Vector3().crossVectors(up, north).normalize();
  
  // Recalculate north to ensure orthogonality
  north.crossVectors(east, up).normalize();
  
  // Heading: 0 = north, 90 = east, 180 = south, 270 = west
  // Add 90 degrees to correct orientation (nose pointing in direction of travel)
  const headingRad = (heading + 90) * (Math.PI / 180);
  
  // Forward direction based on heading
  const forward = new THREE.Vector3()
    .addScaledVector(north, Math.cos(headingRad))
    .addScaledVector(east, Math.sin(headingRad))
    .normalize();
  
  // Create rotation matrix: forward = +Y, up = +Z
  const matrix = new THREE.Matrix4();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  
  matrix.makeBasis(right, forward, up);
  
  const quaternion = new THREE.Quaternion();
  quaternion.setFromRotationMatrix(matrix);
  
  return quaternion;
}

/**
 * Get orientation quaternion, writing to an existing Quaternion
 * Use this in render loops to avoid allocations
 */
export function getOrientationAtLatLonInto(
  lat: number,
  lon: number,
  heading: number,
  target: THREE.Quaternion,
  // Pre-allocated temp vectors (caller provides to avoid allocation)
  tempVecs: {
    position: THREE.Vector3;
    up: THREE.Vector3;
    north: THREE.Vector3;
    east: THREE.Vector3;
    forward: THREE.Vector3;
    right: THREE.Vector3;
    matrix: THREE.Matrix4;
  }
): THREE.Quaternion {
  const { position, up, north, east, forward, right, matrix } = tempVecs;
  
  latLonToVector3Into(lat, lon, 0, 1, position);
  up.copy(position).normalize();
  
  const latRad = lat * (Math.PI / 180);
  const lonRad = lon * (Math.PI / 180);
  
  north.set(
    Math.sin(latRad) * Math.cos(lonRad + Math.PI),
    Math.cos(latRad),
    -Math.sin(latRad) * Math.sin(lonRad + Math.PI)
  ).normalize();
  
  north.sub(_tempVec3.copy(up).multiplyScalar(north.dot(up))).normalize();
  east.crossVectors(up, north).normalize();
  north.crossVectors(east, up).normalize();
  
  const headingRad = (heading + 90) * (Math.PI / 180);
  
  forward.set(0, 0, 0)
    .addScaledVector(north, Math.cos(headingRad))
    .addScaledVector(east, Math.sin(headingRad))
    .normalize();
  
  right.crossVectors(forward, up).normalize();
  matrix.makeBasis(right, forward, up);
  target.setFromRotationMatrix(matrix);
  
  return target;
}

/**
 * Predict position based on speed and heading after elapsed time
 * Uses great-circle approximation for accuracy
 * 
 * @param lat - Current latitude in degrees
 * @param lon - Current longitude in degrees
 * @param heading - Heading in degrees (0 = north)
 * @param speedKnots - Ground speed in knots
 * @param elapsedSeconds - Time elapsed in seconds
 * @returns Predicted {lat, lon}
 */
export function predictPosition(
  lat: number,
  lon: number,
  heading: number,
  speedKnots: number,
  elapsedSeconds: number
): { lat: number; lon: number } {
  // Convert knots to km/s
  const kmPerHour = speedKnots * 1.852;
  const kmPerSecond = kmPerHour / 3600;
  
  // Distance traveled in degrees (approximate at earth's surface)
  // Earth circumference ~40,075 km, so 1 degree = ~111.32 km at equator
  const distanceDegreesEquator = (kmPerSecond * elapsedSeconds / GLOBE.EARTH_CIRCUMFERENCE_KM) * 360;
  
  const headingRad = heading * (Math.PI / 180);
  
  // Calculate new position
  const newLat = lat + distanceDegreesEquator * Math.cos(headingRad);
  
  // Adjust longitude for latitude (longitude degrees are smaller near poles)
  const lonScale = Math.cos(lat * Math.PI / 180);
  const newLon = lon + (distanceDegreesEquator * Math.sin(headingRad)) / Math.max(0.1, lonScale);
  
  return {
    lat: Math.max(-90, Math.min(90, newLat)),
    lon: ((newLon + 180) % 360) - 180, // Normalize to -180 to 180
  };
}

/**
 * Predict altitude based on vertical rate
 * 
 * @param altitude - Current altitude in feet
 * @param verticalRate - Vertical rate in ft/min
 * @param elapsedSeconds - Time elapsed in seconds
 * @returns Predicted altitude in feet
 */
export function predictAltitude(
  altitude: number,
  verticalRate: number | undefined,
  elapsedSeconds: number
): number {
  if (!verticalRate || Math.abs(verticalRate) < 50) return altitude;
  const altChange = (verticalRate / 60) * elapsedSeconds;
  return Math.max(0, altitude + altChange);
}

/**
 * Normalize longitude to -180 to 180 range
 */
export function normalizeLon(lon: number): number {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

/**
 * Interpolate between two points on the globe surface
 * Uses spherical interpolation for smooth curves
 * 
 * @param p1 - Start position (THREE.Vector3)
 * @param p2 - End position (THREE.Vector3)
 * @param t - Interpolation factor (0 to 1)
 * @param altitude - Altitude at this point
 * @returns Interpolated position on globe surface
 */
export function interpolateOnGlobe(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number,
  altitude: number
): THREE.Vector3 {
  const result = new THREE.Vector3();
  result.copy(p1).lerp(p2, t);
  const r = 1 + altitude * GLOBE.ALTITUDE_SCALE;
  result.normalize().multiplyScalar(r);
  return result;
}

/**
 * Interpolate on globe, writing to existing Vector3
 */
export function interpolateOnGlobeInto(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  t: number,
  altitude: number,
  target: THREE.Vector3
): THREE.Vector3 {
  target.copy(p1).lerp(p2, t);
  const r = 1 + altitude * GLOBE.ALTITUDE_SCALE;
  target.normalize().multiplyScalar(r);
  return target;
}

