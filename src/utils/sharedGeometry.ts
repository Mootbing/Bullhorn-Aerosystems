import * as THREE from 'three';
import { AIRCRAFT, AIRPORTS } from '@/config/constants';

// ============================================================================
// SHARED GEOMETRY SINGLETONS
// These are created once and reused across all instances
// NEVER dispose these - they live for the lifetime of the app
// ============================================================================

// Lazy initialization to avoid issues with SSR
let _aircraftTriangleGeometry: THREE.BufferGeometry | null = null;
let _aircraftPlaneGeometry: THREE.BufferGeometry | null = null;
let _aircraftHitboxGeometry: THREE.BufferGeometry | null = null;
let _airportSquareGeometry: THREE.BufferGeometry | null = null;
let _airportSmallSquareGeometry: THREE.BufferGeometry | null = null;

/**
 * Simple 2D triangle for LOD rendering (many aircraft visible)
 */
export function getAircraftTriangleGeometry(): THREE.BufferGeometry {
  if (!_aircraftTriangleGeometry) {
    const s = AIRCRAFT.SIMPLE_TRIANGLE_SIZE;
    const geometry = new THREE.BufferGeometry();
    // Flat triangle pointing in +Y direction (forward)
    const vertices = new Float32Array([
      0, s * 1.2, 0,        // Nose (front)
      -s * 0.6, -s * 0.6, 0, // Back left
      s * 0.6, -s * 0.6, 0,  // Back right
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    _aircraftTriangleGeometry = geometry;
  }
  return _aircraftTriangleGeometry;
}

/**
 * Detailed 3D paper airplane geometry for close-up view
 */
export function getAircraftPlaneGeometry(): THREE.BufferGeometry {
  if (!_aircraftPlaneGeometry) {
    const s = AIRCRAFT.DETAILED_PLANE_SIZE;
    const geometry = new THREE.BufferGeometry();
    
    // Paper airplane: nose at +Y, wings at +Z (away from globe), keel at -Z
    const vertices = new Float32Array([
      // Left wing (top surface)
      0, s * 1.5, 0,
      0, -s * 0.3, 0,
      -s * 0.7, -s * 0.5, s * 0.25,
      
      // Right wing (top surface)
      0, s * 1.5, 0,
      s * 0.7, -s * 0.5, s * 0.25,
      0, -s * 0.3, 0,
      
      // Left wing (bottom surface)
      0, s * 1.5, 0,
      -s * 0.7, -s * 0.5, s * 0.25,
      0, -s * 0.3, 0,
      
      // Right wing (bottom surface)
      0, s * 1.5, 0,
      0, -s * 0.3, 0,
      s * 0.7, -s * 0.5, s * 0.25,
      
      // Body keel (left face)
      0, s * 1.5, 0,
      0, -s * 0.3, 0,
      0, -s * 0.6, -s * 0.15,
      
      // Body keel (right face)
      0, s * 1.5, 0,
      0, -s * 0.6, -s * 0.15,
      0, -s * 0.3, 0,
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    _aircraftPlaneGeometry = geometry;
  }
  return _aircraftPlaneGeometry;
}

/**
 * Larger invisible hitbox geometry for easier clicking
 */
export function getAircraftHitboxGeometry(): THREE.BufferGeometry {
  if (!_aircraftHitboxGeometry) {
    const s = AIRCRAFT.HITBOX_SIZE;
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, s * 1.5, 0,
      -s * 0.8, -s * 0.8, s * 0.4,
      s * 0.8, -s * 0.8, s * 0.4,
      
      0, s * 1.5, 0,
      s * 0.8, -s * 0.8, s * 0.4,
      0, -s * 0.8, -s * 0.3,
      
      0, s * 1.5, 0,
      0, -s * 0.8, -s * 0.3,
      -s * 0.8, -s * 0.8, s * 0.4,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    _aircraftHitboxGeometry = geometry;
  }
  return _aircraftHitboxGeometry;
}

/**
 * Large airport square geometry
 */
export function getAirportSquareGeometry(): THREE.PlaneGeometry {
  if (!_airportSquareGeometry) {
    _airportSquareGeometry = new THREE.PlaneGeometry(
      AIRPORTS.LARGE_AIRPORT_SIZE,
      AIRPORTS.LARGE_AIRPORT_SIZE
    );
  }
  return _airportSquareGeometry as THREE.PlaneGeometry;
}

/**
 * Small airport square geometry
 */
export function getAirportSmallSquareGeometry(): THREE.PlaneGeometry {
  if (!_airportSmallSquareGeometry) {
    _airportSmallSquareGeometry = new THREE.PlaneGeometry(
      AIRPORTS.SMALL_AIRPORT_SIZE,
      AIRPORTS.SMALL_AIRPORT_SIZE
    );
  }
  return _airportSmallSquareGeometry as THREE.PlaneGeometry;
}

// ============================================================================
// SHARED MATERIALS (for instanced rendering)
// ============================================================================

let _aircraftDefaultMaterial: THREE.MeshBasicMaterial | null = null;
let _aircraftHitboxMaterial: THREE.MeshBasicMaterial | null = null;

export function getAircraftDefaultMaterial(): THREE.MeshBasicMaterial {
  if (!_aircraftDefaultMaterial) {
    _aircraftDefaultMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
    });
  }
  return _aircraftDefaultMaterial;
}

export function getAircraftHitboxMaterial(): THREE.MeshBasicMaterial {
  if (!_aircraftHitboxMaterial) {
    _aircraftHitboxMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
  }
  return _aircraftHitboxMaterial;
}

// ============================================================================
// PRE-ALLOCATED OBJECTS FOR RENDER LOOPS
// Use these in useFrame callbacks to avoid GC pressure
// ============================================================================

/**
 * Create a set of pre-allocated THREE objects for use in render loops
 * Each component should create its own set via this factory
 */
export function createRenderLoopAllocations() {
  return {
    // Vectors
    vec3_a: new THREE.Vector3(),
    vec3_b: new THREE.Vector3(),
    vec3_c: new THREE.Vector3(),
    vec3_d: new THREE.Vector3(),
    
    // For orientation calculations
    position: new THREE.Vector3(),
    up: new THREE.Vector3(),
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    
    // Quaternion
    quat: new THREE.Quaternion(),
    
    // Matrix
    matrix: new THREE.Matrix4(),
    
    // Object3D for instanced mesh updates
    dummy: new THREE.Object3D(),
    
    // Color for instanced mesh updates
    color: new THREE.Color(),
    
    // Frustum for visibility checks
    frustum: new THREE.Frustum(),
    projScreenMatrix: new THREE.Matrix4(),
  };
}

export type RenderLoopAllocations = ReturnType<typeof createRenderLoopAllocations>;

