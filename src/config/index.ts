/**
 * @fileoverview Cloistr configuration utilities
 *
 * Provides shared configuration patterns for Cloistr collaboration apps including:
 * - Document ID generation with standardized format
 * - Default service URLs
 * - URL parameter handling
 * - Runtime (container-start) service configuration
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

/** Default Cloistr signer (NIP-46 bunker) URL */
export const DEFAULT_SIGNER_URL = 'https://signer.cloistr.xyz'

/**
 * Name of the global the container writes its runtime configuration to.
 *
 * Exported so the nginx template that emits it and the reader that consumes it
 * cannot drift apart. If this changes, the template changes in the same commit.
 */
export const RUNTIME_CONFIG_GLOBAL = '__CLOISTR_CONFIG__'

/**
 * Runtime configuration, written by the container at startup.
 *
 * Every field is optional. An absent field means "use the build-time value, or
 * failing that the default", so an image with no runtime configuration behaves
 * exactly as it did before this mechanism existed. That is deliberate: it is
 * what makes adopting this safe for a live service.
 */
export interface RuntimeConfig {
  relayUrl?: string
  blossomUrl?: string
  discoveryUrl?: string
  signerUrl?: string
  /** This app's own public base URL, for links it generates about itself. */
  appUrl?: string
  /** Free-form environment name, e.g. 'production' or 'staging'. */
  environment?: string
  /**
   * Per-service URL overrides for cross-app navigation, keyed by the service id
   * used by the shared nav catalog.
   *
   * There is deliberately no default here. The nav catalog lives in the
   * interface package and stays the single source for what services exist;
   * this map only overrides where they live.
   */
  services?: Record<string, string>
}

declare global {
  interface Window {
    __CLOISTR_CONFIG__?: RuntimeConfig
  }
}

/**
 * Configuration for Cloistr services.
 *
 * Resolved from runtime configuration, then build-time environment variables,
 * then defaults.
 */
export interface ServiceConfig {
  relayUrl: string
  blossomUrl: string
  discoveryUrl: string
  signerUrl: string
  appUrl?: string
  environment: string
  services: Record<string, string>
}

/**
 * Read the runtime configuration the container wrote, if any.
 *
 * Returns an empty object when there is none, which is the normal case in a dev
 * server and in any image built before this mechanism shipped.
 */
export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return {}
  const raw = window.__CLOISTR_CONFIG__
  if (!raw || typeof raw !== 'object') return {}
  return raw
}

/** Schemes each URL field is expected to use. */
const EXPECTED_SCHEMES: Record<string, string[]> = {
  relayUrl: ['ws:', 'wss:'],
  blossomUrl: ['http:', 'https:'],
  discoveryUrl: ['http:', 'https:'],
  signerUrl: ['http:', 'https:'],
  appUrl: ['http:', 'https:'],
}

const warned = new Set<string>()

/**
 * Complain about a runtime value that is the wrong shape, once per field.
 *
 * It complains and then USES the value anyway. Substituting a default here
 * would mean a staging deployment with one typo silently talking to
 * production, which is the exact failure this mechanism exists to prevent. A
 * URL that cannot connect is a loud, local failure; a URL that connects to the
 * wrong environment is a silent one.
 */
function checkScheme(field: string, value: string): void {
  const expected = EXPECTED_SCHEMES[field]
  if (!expected) return

  let scheme: string
  try {
    scheme = new URL(value).protocol
  } catch {
    if (!warned.has(field)) {
      warned.add(field)
      console.error(
        `[cloistr config] runtime ${field} is not a valid URL: ${JSON.stringify(value)}. ` +
          `Using it as given rather than falling back, so this fails loudly instead of ` +
          `silently reaching another environment.`
      )
    }
    return
  }

  if (!expected.includes(scheme)) {
    if (!warned.has(field)) {
      warned.add(field)
      console.error(
        `[cloistr config] runtime ${field} has scheme ${scheme} but expected one of ` +
          `${expected.join(', ')}: ${JSON.stringify(value)}. Using it as given.`
      )
    }
  }
}

/**
 * Get service configuration.
 *
 * Resolution order for each value, highest first:
 *   1. Runtime configuration written by the container at startup.
 *   2. Build-time environment variable baked into the bundle.
 *   3. The default.
 *
 * Runtime wins because the image is built once, with production values baked
 * in, and then run in more than one environment.
 *
 * Environment variables (build time):
 * - VITE_RELAY_URL / REACT_APP_RELAY_URL
 * - VITE_BLOSSOM_URL / REACT_APP_BLOSSOM_URL
 * - VITE_DISCOVERY_URL / REACT_APP_DISCOVERY_URL
 * - VITE_SIGNER_URL / REACT_APP_SIGNER_URL
 *
 * @returns Service configuration
 */
export function getServiceConfig(): ServiceConfig {
  const runtime = getRuntimeConfig()

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

  const resolve = (
    field: keyof RuntimeConfig,
    viteKey: string,
    craKey: string,
    defaultValue: string
  ): string => {
    const fromRuntime = runtime[field]
    if (typeof fromRuntime === 'string' && fromRuntime !== '') {
      checkScheme(field, fromRuntime)
      return fromRuntime
    }
    return getEnv(viteKey, craKey, defaultValue)
  }

  const appUrl =
    typeof runtime.appUrl === 'string' && runtime.appUrl !== '' ? runtime.appUrl : undefined
  if (appUrl) checkScheme('appUrl', appUrl)

  return {
    relayUrl: resolve('relayUrl', 'VITE_RELAY_URL', 'REACT_APP_RELAY_URL', DEFAULT_RELAY_URL),
    blossomUrl: resolve(
      'blossomUrl',
      'VITE_BLOSSOM_URL',
      'REACT_APP_BLOSSOM_URL',
      DEFAULT_BLOSSOM_URL
    ),
    discoveryUrl: resolve(
      'discoveryUrl',
      'VITE_DISCOVERY_URL',
      'REACT_APP_DISCOVERY_URL',
      DEFAULT_DISCOVERY_URL
    ),
    signerUrl: resolve('signerUrl', 'VITE_SIGNER_URL', 'REACT_APP_SIGNER_URL', DEFAULT_SIGNER_URL),
    appUrl,
    environment:
      typeof runtime.environment === 'string' && runtime.environment !== ''
        ? runtime.environment
        : 'production',
    services: runtime.services && typeof runtime.services === 'object' ? runtime.services : {},
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

/**
 * Drop the memoized config and the once-only warnings.
 *
 * For tests. Nothing in an app should need this: the runtime config is written
 * before the bundle runs and does not change afterwards.
 */
export function _resetServiceConfig(): void {
  cachedConfig = null
  warned.clear()
}
