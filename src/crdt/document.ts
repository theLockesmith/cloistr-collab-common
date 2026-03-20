import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { DocType, DocTypeMap } from './types.js';

/**
 * Create a new collaborative Yjs document
 */
export function createCollabDoc(_docId: string, docType: DocType): Y.Doc {
  const ydoc = new Y.Doc();

  // Set document metadata
  ydoc.clientID = Math.floor(Math.random() * 2147483647);

  // Initialize the appropriate shared type based on document type
  getSharedType(ydoc, docType);

  return ydoc;
}

/**
 * Get the appropriate Yjs shared type for a document type
 */
export function getSharedType<T extends DocType>(
  doc: Y.Doc,
  docType: T
): DocTypeMap[T] {
  switch (docType) {
    case 'doc':
      return doc.getText('content') as DocTypeMap[T];

    case 'sheet':
      // For spreadsheets, use a Map to store cells and metadata
      return doc.getMap('sheet') as DocTypeMap[T];

    case 'slide':
      // For presentations, use an Array to store slide order and data
      return doc.getArray('slides') as DocTypeMap[T];

    case 'whiteboard':
      // For whiteboards, use a Map to store drawing elements
      return doc.getMap('whiteboard') as DocTypeMap[T];

    default:
      throw new Error(`Unsupported document type: ${docType}`);
  }
}

/**
 * Serialize a Yjs document to binary format
 */
export function serializeDoc(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Create a Yjs document from serialized binary data
 */
export function deserializeDoc(data: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, data);
  return doc;
}

/**
 * Merge two Yjs documents, applying all changes from source to target
 */
export function mergeDocuments(target: Y.Doc, source: Y.Doc): void {
  const update = Y.encodeStateAsUpdate(source);
  Y.applyUpdate(target, update);
}

/**
 * Get the document state vector (for efficient syncing)
 */
export function getStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

/**
 * Get document updates since a specific state vector
 */
export function getUpdatesSinceStateVector(doc: Y.Doc, stateVector: Uint8Array): Uint8Array {
  return Y.encodeStateAsUpdate(doc, stateVector);
}

/**
 * Initialize persistence for a document using IndexedDB
 */
export function initPersistence(doc: Y.Doc, docId: string): IndexeddbPersistence {
  const persistence = new IndexeddbPersistence(docId, doc);

  return persistence;
}

/**
 * Clone a document (create a new document with the same state)
 */
export function cloneDocument(source: Y.Doc): Y.Doc {
  const clone = new Y.Doc();
  const update = Y.encodeStateAsUpdate(source);
  Y.applyUpdate(clone, update);
  return clone;
}

/**
 * Get document statistics
 */
export interface DocStats {
  /** Total number of operations */
  operationCount: number;
  /** Document size in bytes */
  sizeBytes: number;
  /** Number of clients that have contributed */
  clientCount: number;
  /** Last modified timestamp */
  lastModified: number;
}

export function getDocumentStats(doc: Y.Doc): DocStats {
  const update = Y.encodeStateAsUpdate(doc);
  const clients = new Set<number>();

  // Parse the update to count operations and clients
  let operationCount = 0;
  const state = doc.store.clients;

  Array.from(state.entries()).forEach(([clientId, structs]) => {
    clients.add(clientId);
    operationCount += structs.length;
  });

  return {
    operationCount,
    sizeBytes: update.length,
    clientCount: clients.size,
    lastModified: Date.now(), // Yjs doesn't track this directly
  };
}

/**
 * Validate that a document update is well-formed
 */
export function validateUpdate(update: Uint8Array): boolean {
  try {
    // Try to create a temporary doc and apply the update
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, update);
    return true;
  } catch (error) {
    console.warn('Invalid Yjs update:', error);
    return false;
  }
}

/**
 * Initialize a document with default content based on type
 */
export function initializeDocumentContent(doc: Y.Doc, docType: DocType): void {
  switch (docType) {
    case 'doc':
      const text = doc.getText('content');
      if (text.length === 0) {
        text.insert(0, '# New Document\n\nStart writing here...');
      }
      break;

    case 'sheet':
      const sheet = doc.getMap('sheet');
      if (sheet.size === 0) {
        sheet.set('cells', new Y.Map());
        sheet.set('metadata', new Y.Map());
        const metadata = sheet.get('metadata') as Y.Map<any>;
        metadata.set('title', 'New Spreadsheet');
        metadata.set('created', Date.now());
      }
      break;

    case 'slide':
      const slides = doc.getArray('slides');
      if (slides.length === 0) {
        const firstSlide = new Y.Map();
        firstSlide.set('title', 'Welcome');
        firstSlide.set('content', 'Your presentation starts here');
        firstSlide.set('layout', 'title-content');
        slides.push([firstSlide]);
      }
      break;

    case 'whiteboard':
      const whiteboard = doc.getMap('whiteboard');
      if (whiteboard.size === 0) {
        whiteboard.set('elements', new Y.Array());
        whiteboard.set('metadata', new Y.Map());
        const metadata = whiteboard.get('metadata') as Y.Map<any>;
        metadata.set('width', 1920);
        metadata.set('height', 1080);
        metadata.set('background', '#ffffff');
      }
      break;
  }
}