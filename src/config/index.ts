/**
 * @fileoverview Cloistr configuration utilities
 *
 * Provides shared configuration patterns for Cloistr collaboration apps including:
 * - Document ID generation with standardized format
 * - Default service URLs
 * - URL parameter handling
 */

// ============================================
// Document ID Generation
// ============================================

/** Document type prefixes for ID generation */
export type DocTypePrefix = 'doc' | 'slides' | 'whiteboard' | 'sheet' | 'space' | string

/**
 * Generate a new document ID with standardized format.
 * Format: {type}-{timestamp}-{random8}
 *
 * @param type - Document type prefix (e.g., 'doc', 'slides', 'whiteboard')
 * @returns Generated document ID
 *
 * @example
 * ```ts
 * const docId = generateDocumentId('doc')
 * // Returns: 'doc-1711392000000-a1b2c3d4'
 * ```
 */
export function generateDocumentId(type: DocTypePrefix): string {
  const timestamp = Date.now()
  const random = crypto.randomUUID().slice(0, 8)
  return `${type}-${timestamp}-${random}`
}

/**
 * Parse a document ID to extract its components.
 *
 * @param docId - Document ID to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * ```ts
 * const parsed = parseDocumentId('doc-1711392000000-a1b2c3d4')
 * // Returns: { type: 'doc', timestamp: 1711392000000, random: 'a1b2c3d4' }
 * ```
 */
export function parseDocumentId(docId: string): {
  type: string
  timestamp: number
  random: string
} | null {
  const match = docId.match(/^([a-z]+)-(\d+)-([a-f0-9]+)$/i)
  if (!match) return null

  return {
    type: match[1],
    timestamp: parseInt(match[2], 10),
    random: match[3],
  }
}

/**
 * Validate a document ID format.
 *
 * @param docId - Document ID to validate
 * @returns True if valid format
 */
export function isValidDocumentId(docId: string): boolean {
  return parseDocumentId(docId) !== null
}

/**
 * Get document ID from URL parameter, or generate a new one.
 * Updates browser URL with the document ID.
 *
 * @param type - Document type for new ID generation
 * @param paramName - URL parameter name (default: 'docId')
 * @returns Document ID (existing from URL or newly generated)
 *
 * @example
 * ```ts
 * // In a React component:
 * const [documentId] = useState(() => getOrCreateDocumentId('doc'))
 * ```
 */
export function getOrCreateDocumentId(
  type: DocTypePrefix,
  paramName: string = 'docId'
): string {
  if (typeof window === 'undefined') {
    // SSR fallback
    return generateDocumentId(type)
  }

  const params = new URLSearchParams(window.location.search)
  const existingId = params.get(paramName)

  if (existingId) {
    return existingId
  }

  // Generate new ID and update URL
  const newId = generateDocumentId(type)
  const newUrl = new URL(window.location.href)
  newUrl.searchParams.set(paramName, newId)
  window.history.replaceState({}, '', newUrl.toString())

  return newId
}

// ============================================
// Default Service URLs
// ============================================

/** Default Cloistr relay URL */
export const DEFAULT_RELAY_URL = 'wss://relay.cloistr.xyz'

/** Default Blossom storage URL */
export const DEFAULT_BLOSSOM_URL = 'https://nostr.download'

/** Default Cloistr discovery service URL */
export const DEFAULT_DISCOVERY_URL = 'https://discover.cloistr.xyz'

/**
 * Configuration for Cloistr services.
 * Reads from environment variables with sensible defaults.
 */
export interface ServiceConfig {
  relayUrl: string
  blossomUrl: string
  discoveryUrl: string
}

/**
 * Get service configuration from environment variables.
 * Falls back to defaults if not specified.
 *
 * Environment variables:
 * - VITE_RELAY_URL / REACT_APP_RELAY_URL
 * - VITE_BLOSSOM_URL / REACT_APP_BLOSSOM_URL
 * - VITE_DISCOVERY_URL / REACT_APP_DISCOVERY_URL
 *
 * @returns Service configuration
 */
export function getServiceConfig(): ServiceConfig {
  // Support both Vite and CRA environment variable patterns
  const getEnv = (viteKey: string, craKey: string, defaultValue: string): string => {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[viteKey] || defaultValue
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[craKey] || defaultValue
    }
    return defaultValue
  }

  return {
    relayUrl: getEnv('VITE_RELAY_URL', 'REACT_APP_RELAY_URL', DEFAULT_RELAY_URL),
    blossomUrl: getEnv('VITE_BLOSSOM_URL', 'REACT_APP_BLOSSOM_URL', DEFAULT_BLOSSOM_URL),
    discoveryUrl: getEnv('VITE_DISCOVERY_URL', 'REACT_APP_DISCOVERY_URL', DEFAULT_DISCOVERY_URL),
  }
}

/**
 * React hook for service configuration.
 * Memoizes the config on first call.
 */
let cachedConfig: ServiceConfig | null = null

export function useServiceConfig(): ServiceConfig {
  if (!cachedConfig) {
    cachedConfig = getServiceConfig()
  }
  return cachedConfig
}
