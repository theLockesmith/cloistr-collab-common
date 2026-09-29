import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

/**
 * Initialize persistence for a document using IndexedDB.
 * Browser-only: requires IndexedDB (y-indexeddb).
 */
export function initPersistence(doc: Y.Doc, docId: string): IndexeddbPersistence {
  const persistence = new IndexeddbPersistence(docId, doc);
  return persistence;
}
