import { ComponentType } from 'react';
import { EntityType, MapEntity, AnyEntity } from '@/types/entities';

// ============================================================================
// ENTITY REGISTRY
// Central registry for entity type configurations
// Each entity type registers its renderer, info panel, and search config
// ============================================================================

/**
 * Filter for searching entities
 */
export interface EntityFilter {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'between';
  value: string | number | boolean | [number, number];
}

/**
 * Configuration for each entity type
 */
export interface EntityTypeConfig<T extends MapEntity = MapEntity> {
  // Display
  displayName: string;
  pluralName: string;
  icon: string; // Unicode or emoji for now, can be React component later
  color: string; // Primary color for this entity type
  
  // Search configuration
  searchFields: string[];
  matchEntity: (entity: T, filters: EntityFilter[], freeText: string[]) => boolean;
  getSearchableText: (entity: T) => string;
  
  // Display helpers
  getDisplayName: (entity: T) => string;
  getSubtitle: (entity: T) => string;
}

// ============================================================================
// ENTITY TYPE CONFIGURATIONS
// ============================================================================

const aircraftConfig: EntityTypeConfig = {
  displayName: 'Aircraft',
  pluralName: 'Aircraft',
  icon: '✈',
  color: '#00ff88',
  
  searchFields: ['callsign', 'id', 'originCountry', 'altitude', 'speed', 'heading', 'squawk'],
  
  matchEntity: (entity, filters, freeText) => {
    const ac = entity as any;
    
    // Match filters
    for (const filter of filters) {
      const value = getFieldValue(ac, filter.field);
      if (!matchesFilter(value, filter)) return false;
    }
    
    // Match free text
    if (freeText.length > 0) {
      const searchable = [ac.callsign, ac.id, ac.originCountry, ac.type, ac.squawk]
        .filter(Boolean).join(' ').toLowerCase();
      if (!freeText.some(term => searchable.includes(term.toLowerCase()))) {
        return false;
      }
    }
    
    return true;
  },
  
  getSearchableText: (entity) => {
    const ac = entity as any;
    return [ac.callsign, ac.id, ac.originCountry, ac.type, ac.squawk]
      .filter(Boolean).join(' ');
  },
  
  getDisplayName: (entity) => {
    const ac = entity as any;
    return ac.callsign || ac.id;
  },
  
  getSubtitle: (entity) => {
    const ac = entity as any;
    return ac.originCountry || 'Unknown';
  },
};

const airportConfig: EntityTypeConfig = {
  displayName: 'Airport',
  pluralName: 'Airports',
  icon: '🏢',
  color: '#ffffff',
  
  searchFields: ['icao', 'iata', 'name', 'city', 'country', 'airportType'],
  
  matchEntity: (entity, filters, freeText) => {
    const ap = entity as any;
    
    // Match filters
    for (const filter of filters) {
      const value = getFieldValue(ap, filter.field);
      if (!matchesFilter(value, filter)) return false;
    }
    
    // Match free text
    if (freeText.length > 0) {
      const searchable = [ap.icao, ap.iata, ap.name, ap.city, ap.country]
        .filter(Boolean).join(' ').toLowerCase();
      if (!freeText.some(term => searchable.includes(term.toLowerCase()))) {
        return false;
      }
    }
    
    return true;
  },
  
  getSearchableText: (entity) => {
    const ap = entity as any;
    return [ap.icao, ap.iata, ap.name, ap.city, ap.country]
      .filter(Boolean).join(' ');
  },
  
  getDisplayName: (entity) => {
    const ap = entity as any;
    return ap.iata || ap.icao;
  },
  
  getSubtitle: (entity) => {
    const ap = entity as any;
    return ap.name || ap.city || 'Unknown';
  },
};

const missileConfig: EntityTypeConfig = {
  displayName: 'Missile',
  pluralName: 'Missiles',
  icon: '🚀',
  color: '#ff4444',
  
  searchFields: ['missileType', 'status', 'altitude', 'speed'],
  
  matchEntity: (entity, filters, freeText) => {
    const m = entity as any;
    
    for (const filter of filters) {
      const value = getFieldValue(m, filter.field);
      if (!matchesFilter(value, filter)) return false;
    }
    
    if (freeText.length > 0) {
      const searchable = [m.missileType, m.status].filter(Boolean).join(' ').toLowerCase();
      if (!freeText.some(term => searchable.includes(term.toLowerCase()))) {
        return false;
      }
    }
    
    return true;
  },
  
  getSearchableText: (entity) => {
    const m = entity as any;
    return [m.missileType, m.status].filter(Boolean).join(' ');
  },
  
  getDisplayName: (entity) => {
    const m = entity as any;
    return m.missileType || 'Unknown Missile';
  },
  
  getSubtitle: (entity) => {
    const m = entity as any;
    return m.status || 'Unknown';
  },
};

// Placeholder configs for future entity types
const radarConfig: EntityTypeConfig = {
  displayName: 'Radar',
  pluralName: 'Radars',
  icon: '📡',
  color: '#00aaff',
  searchFields: ['name', 'range'],
  matchEntity: () => true,
  getSearchableText: (e) => (e as any).name || '',
  getDisplayName: (e) => (e as any).name || 'Radar',
  getSubtitle: () => 'Radar Site',
};

const samSiteConfig: EntityTypeConfig = {
  displayName: 'SAM Site',
  pluralName: 'SAM Sites',
  icon: '🎯',
  color: '#ff8800',
  searchFields: ['name', 'systemType', 'range'],
  matchEntity: () => true,
  getSearchableText: (e) => (e as any).name || '',
  getDisplayName: (e) => (e as any).name || 'SAM Site',
  getSubtitle: (e) => (e as any).systemType || 'Unknown',
};

const shipConfig: EntityTypeConfig = {
  displayName: 'Ship',
  pluralName: 'Ships',
  icon: '🚢',
  color: '#4488ff',
  searchFields: ['name', 'shipType', 'flag'],
  matchEntity: () => true,
  getSearchableText: (e) => (e as any).name || '',
  getDisplayName: (e) => (e as any).name || 'Ship',
  getSubtitle: (e) => (e as any).flag || 'Unknown',
};

const drawShapeConfig: EntityTypeConfig = {
  displayName: 'Shape',
  pluralName: 'Shapes',
  icon: '✏️',
  color: '#aa88ff',
  searchFields: ['label', 'shapeType'],
  matchEntity: () => true,
  getSearchableText: (e) => (e as any).label || '',
  getDisplayName: (e) => (e as any).label || 'Shape',
  getSubtitle: (e) => (e as any).shapeType || 'Unknown',
};

// ============================================================================
// REGISTRY
// ============================================================================

export const entityRegistry: Record<EntityType, EntityTypeConfig> = {
  aircraft: aircraftConfig,
  airport: airportConfig,
  missile: missileConfig,
  radar: radarConfig,
  sam_site: samSiteConfig,
  ship: shipConfig,
  draw_shape: drawShapeConfig,
};

/**
 * Get configuration for an entity type
 */
export function getEntityConfig(type: EntityType): EntityTypeConfig {
  return entityRegistry[type];
}

/**
 * Get all entity types that are currently active (have data)
 */
export function getActiveEntityTypes(): EntityType[] {
  // For now, return the main types. This could be dynamic based on what data exists.
  return ['aircraft', 'airport'];
}

/**
 * Get all searchable entity types
 */
export function getSearchableEntityTypes(): EntityType[] {
  return ['aircraft', 'airport', 'missile'];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getFieldValue(entity: any, field: string): any {
  // Handle nested fields like position.altitude
  const parts = field.split('.');
  let value = entity;
  for (const part of parts) {
    if (value === undefined || value === null) return undefined;
    value = value[part];
  }
  
  // Handle common field mappings
  if (field === 'altitude' && value === undefined) {
    value = entity.position?.alt;
  }
  if (field === 'heading' && value === undefined) {
    value = entity.position?.heading;
  }
  if (field === 'speed' && value === undefined) {
    value = entity.position?.speed;
  }
  
  return value;
}

function matchesFilter(value: any, filter: EntityFilter): boolean {
  if (value === undefined || value === null) return false;
  
  switch (filter.operator) {
    case 'equals':
      return String(value).toLowerCase() === String(filter.value).toLowerCase();
    case 'contains':
      return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'gt':
      return typeof value === 'number' && value > Number(filter.value);
    case 'lt':
      return typeof value === 'number' && value < Number(filter.value);
    case 'between':
      if (Array.isArray(filter.value) && typeof value === 'number') {
        const [min, max] = filter.value;
        // Handle wrap-around for heading
        if (min > max) {
          return value >= min || value <= max;
        }
        return value >= min && value <= max;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Search across all entity types
 */
export function searchEntities(
  entities: Map<EntityType, MapEntity[]>,
  filters: EntityFilter[],
  freeText: string[],
  targetTypes?: EntityType[]
): { type: EntityType; entity: MapEntity }[] {
  const results: { type: EntityType; entity: MapEntity }[] = [];
  const typesToSearch = targetTypes || getSearchableEntityTypes();
  
  for (const type of typesToSearch) {
    const typeEntities = entities.get(type) || [];
    const config = entityRegistry[type];
    
    for (const entity of typeEntities) {
      if (config.matchEntity(entity, filters, freeText)) {
        results.push({ type, entity });
      }
    }
  }
  
  return results;
}

