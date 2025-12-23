/**
 * Centralized configuration for all magic numbers and constants
 * Organized by feature/component area
 */

// =============================================================================
// CAMERA SETTINGS
// =============================================================================

export const CAMERA = {
  // Distance limits
  MIN_DISTANCE: 0.15,          // Minimum zoom (closest to globe)
  MAX_DISTANCE: 5,             // Maximum zoom (furthest from globe)
  DEFAULT_DISTANCE: 2.5,       // Default camera distance on load
  CITY_ZOOM_DISTANCE: 1.15,    // Zoom level when viewing a city
  PATH_VIEW_DISTANCE: 1.25,    // Distance to view full flight path
  FLYOVER_ZOOM_OUT: 2.2,       // Distance to zoom out during flyover animation
  
  // Follow cam
  FOLLOW_DISTANCE: 0.04,       // Distance behind aircraft in follow mode
  FOLLOW_LOOK_AHEAD: 0.01,     // How far ahead of aircraft to look
  
  // Controls
  ZOOM_SPEED_KEYBOARD: 0.7,    // Keyboard zoom speed multiplier
  ZOOM_SPEED_TRACKPAD: 0.4,    // Trackpad/scroll zoom speed
  PAN_SPEED: 0.3,              // Arrow key pan speed
  ROTATE_SPEED_MIN: 0.08,      // Minimum rotation speed (zoomed in)
  ROTATE_SPEED_MAX: 0.8,       // Maximum rotation speed (zoomed out)
  
  // Animation
  SLANT_ANGLE: 0.4,            // Radians - angle of slant from vertical (~23 degrees)
} as const;

// =============================================================================
// DEFAULT LOCATIONS
// =============================================================================

export const LOCATIONS = {
  // Default fallback location (New York City)
  DEFAULT: { lat: 40.7128, lon: -74.006 },
} as const;

// =============================================================================
// GLOBE / 3D POSITIONING
// =============================================================================

export const GLOBE = {
  // Altitude to 3D position conversion factor
  ALTITUDE_SCALE: 0.0000005,
  
  // Surface offsets
  AIRPORT_SURFACE_OFFSET: 1.001,  // Airports slightly above globe surface
  
  // Earth constants
  EARTH_RADIUS_KM: 6371,
  EARTH_CIRCUMFERENCE_KM: 2 * Math.PI * 6371,
} as const;

// =============================================================================
// AIRCRAFT RENDERING
// =============================================================================

export const AIRCRAFT = {
  // Geometry sizes
  SIMPLE_TRIANGLE_SIZE: 0.006,    // LOD simple triangle size
  DETAILED_PLANE_SIZE: 0.008,     // Detailed paper airplane size
  HITBOX_SIZE: 0.02,              // Click hitbox size
  
  // LOD (Level of Detail)
  LOD_THRESHOLD: 500,             // Switch to simple triangles above this count
  
  // Viewport edge fading
  EDGE_FADE_ZONE: 0.05,           // 5% of viewport for edge fade
  
  // Deloading
  DELOAD_GRACE_PERIOD: 5000,      // ms before deloading out-of-view aircraft
  DELOAD_CHECK_INTERVAL: 2000,    // ms between deload checks
  
  // Dead reckoning
  PREDICTION_MAX_SECONDS: 120,    // Max seconds to predict position
  MIN_SPEED_FOR_PREDICTION: 10,   // Knots - minimum speed to use prediction
} as const;

// =============================================================================
// AIRPORT RENDERING
// =============================================================================

export const AIRPORTS = {
  // Geometry sizes
  LARGE_AIRPORT_SIZE: 0.0025,     // Large airport square size
  SMALL_AIRPORT_SIZE: 0.0012,     // Small airport square size
  
  // Visibility
  SMALL_AIRPORT_FADE_DISTANCE: 1.5,  // Camera distance where small airports start fading
  SMALL_AIRPORT_FADE_SPEED: 3,       // Fade speed multiplier
  SMALL_AIRPORT_MAX_OPACITY: 0.5,    // Maximum opacity for small airports
} as const;

// =============================================================================
// FLIGHT PATH RENDERING
// =============================================================================

export const FLIGHT_PATH = {
  // Animation
  ANIMATION_DURATION: 0.3,        // Total animation time in seconds
  TRAVELED_RATIO: 0.5,            // First half for traveled path
  PREDICTED_RATIO: 0.5,           // Second half for predicted path
  
  // Prediction
  PREDICT_MINUTES: 10,            // Minutes of future path to show
  HISTORY_MINUTES: 30,            // Minutes of past track (for mock data)
} as const;

// =============================================================================
// DATA POLLING
// =============================================================================

export const POLLING = {
  BASE_INTERVAL: 15000,           // Base polling interval in ms
  MAX_BACKOFF_MULTIPLIER: 8,      // Maximum backoff (8x = 2 minutes)
  DEBOUNCE_VIEWPORT_CHANGE: 300,  // ms to debounce viewport changes
  
  // Cache
  FLIGHT_TRACK_CACHE_TTL: 60000,  // 1 minute cache for flight tracks
} as const;

// =============================================================================
// INPUT CONTROLS (Mouse / Keyboard / Touch)
// =============================================================================

export const INPUT = {
  // Mouse controls (OrbitControls)
  MOUSE: {
    PAN_SPEED: 0.5,               // Mouse pan speed
    ROTATE_SPEED: 0.5,            // Mouse rotate speed (base, adjusted by zoom)
    DAMPING_FACTOR: 0.1,          // Inertia/smoothing factor
  },
  
  // Keyboard controls
  KEYBOARD: {
    ZOOM_SPEED: 1.5,              // Zoom in/out speed (per second)
    PAN_SPEED: 0.3,               // Arrow key pan speed (per second)
    ZOOM_LIMIT_TOLERANCE: 0.001,  // Tolerance for zoom limit detection
    ROTATE_ZOOM_SCALE: 0.2,       // Scale factor for zoom-based rotation speed
  },
  
  // Touch controls
  TOUCH: {
    // Same as mouse for now, but can be customized
    PAN_SPEED: 0.5,
    ROTATE_SPEED: 0.5,
  },
  
  // Animation speeds
  ANIMATION: {
    CAMERA_DIRECT_SPEED: 1.2,     // Direct animation speed multiplier
    CAMERA_FLYOVER_SPEED: 0.8,    // Flyover animation speed multiplier
    FLYOVER_TRAVEL_THRESHOLD: 0.3, // Min distance to trigger flyover
    OFFSET_ZOOM_MULTIPLIER: 0.5,  // How fast offset zooms relative to camera
    MIN_OFFSET_DISTANCE: 0.02,    // Minimum camera offset distance
  },
} as const;

// =============================================================================
// UI / INTERACTION
// =============================================================================

export const UI = {
  // Mode bar
  TAB_HOLD_THRESHOLD: 300,        // ms to trigger mode menu on Tab hold
  
  // Search
  SEARCH_DEBOUNCE: 300,           // ms debounce for search input
  SEARCH_MAX_RESULTS: 30,         // Maximum search results to show
  
  // Entity snapping
  SNAP_MAX_DISTANCE: 30,          // Max degrees to search for snap target
  SNAP_MIN_DISTANCE: 0.5,         // Min degrees (ignore same position)
  HOVER_SNAP_DISTANCE: 25,        // Degrees within which to hover (5 degrees squared)
  
  // Entity info panel
  INFO_PANEL_WIDTH: 300,          // Fixed width for bottom-left detail card (px)
} as const;

// =============================================================================
// COLORS
// =============================================================================

export const COLORS = {
  // Aircraft
  AIRCRAFT_DEFAULT: '#00ff88',
  AIRCRAFT_SELECTED: '#00aaff',
  AIRCRAFT_HOVERED: '#00ffaa',
  
  // Airports
  AIRPORT_DEFAULT: '#ffffff',
  AIRPORT_HOVERED: '#00ff88',
  
  // UI
  UI_ACCENT: '#00ff88',
  UI_MUTED: '#555',
  UI_DARK: '#222',
  UI_HIGHLIGHT: '#ffff00',
} as const;

