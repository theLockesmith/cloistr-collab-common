/**
 * React hooks for encrypted blob storage
 */

import { useMemo, useCallback, useState } from 'react';
import { BlobStore } from './blossom.js';
import { encryptBlob, decryptBlob, generateKey } from './encryption.js';
import {
  BlobMetadata,
  EncryptedBlob,
  StorageConfig,
  StorageSignerInterface,
  EncryptionError,
  BlossomError
} from './types.js';

/**
 * Hook to get a BlobStore instance
 */
export function useBlobStore(config: StorageConfig): BlobStore {
  return useMemo(() => new BlobStore(config), [config.blossomUrl, config.authPubkey]);
}

/**
 * State for upload operations
 */
export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  metadata: BlobMetadata | null;
}

/**
 * Hook for encrypted file uploads
 */
export function useEncryptedUpload(
  config: StorageConfig,
  signer: StorageSignerInterface
) {
  const blobStore = useBlobStore(config);
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    metadata: null,
  });

  const uploadBlob = useCallback(async (
    data: Uint8Array,
    _mimeType: string,
    encryptionKey?: Uint8Array
  ): Promise<{ metadata: BlobMetadata; encryptionKey: Uint8Array }> => {
    setState(prev => ({ ...prev, isUploading: true, progress: 0, error: null, metadata: null }));

    try {
      // Generate encryption key if not provided
      const key = encryptionKey || await generateKey();

      setState(prev => ({ ...prev, progress: 25 }));

      // Encrypt the data
      const encrypted = await encryptBlob(data, key);

      setState(prev => ({ ...prev, progress: 50 }));

      // Convert encrypted blob to bytes for upload
      const encryptedData = new TextEncoder().encode(JSON.stringify(encrypted));

      setState(prev => ({ ...prev, progress: 75 }));

      // Upload to Blossom
      const metadata = await blobStore.upload(encryptedData, 'application/json', signer);

      setState(prev => ({
        ...prev,
        isUploading: false,
        progress: 100,
        metadata
      }));

      return { metadata, encryptionKey: key };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setState(prev => ({
        ...prev,
        isUploading: false,
        progress: 0,
        error: errorMessage
      }));
      throw error;
    }
  }, [blobStore, signer]);

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      metadata: null,
    });
  }, []);

  return {
    uploadBlob,
    reset,
    ...state,
  };
}

/**
 * State for download operations
 */
export interface DownloadState {
  isDownloading: boolean;
  progress: number;
  error: string | null;
  data: Uint8Array | null;
}

/**
 * Hook for encrypted file downloads
 */
export function useEncryptedDownload(config: StorageConfig) {
  const blobStore = useBlobStore(config);
  const [state, setState] = useState<DownloadState>({
    isDownloading: false,
    progress: 0,
    error: null,
    data: null,
  });

  const downloadBlob = useCallback(async (
    hash: string,
    encryptionKey: Uint8Array
  ): Promise<Uint8Array> => {
    setState(prev => ({ ...prev, isDownloading: true, progress: 0, error: null, data: null }));

    try {
      setState(prev => ({ ...prev, progress: 25 }));

      // Download from Blossom
      const encryptedData = await blobStore.download(hash);

      setState(prev => ({ ...prev, progress: 50 }));

      // Parse the encrypted blob
      const encryptedBlob: EncryptedBlob = JSON.parse(new TextDecoder().decode(encryptedData));

      setState(prev => ({ ...prev, progress: 75 }));

      // Decrypt the data
      const data = await decryptBlob(encryptedBlob, encryptionKey);

      setState(prev => ({
        ...prev,
        isDownloading: false,
        progress: 100,
        data
      }));

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      setState(prev => ({
        ...prev,
        isDownloading: false,
        progress: 0,
        error: errorMessage
      }));
      throw error;
    }
  }, [blobStore]);

  const reset = useCallback(() => {
    setState({
      isDownloading: false,
      progress: 0,
      error: null,
      data: null,
    });
  }, []);

  return {
    downloadBlob,
    reset,
    ...state,
  };
}

/**
 * Hook for blob management operations
 */
export function useBlobManager(config: StorageConfig, signer: StorageSignerInterface) {
  const blobStore = useBlobStore(config);

  const deleteBlob = useCallback(async (hash: string): Promise<void> => {
    try {
      await blobStore.delete(hash, signer);
    } catch (error) {
      throw error;
    }
  }, [blobStore, signer]);

  const checkExists = useCallback(async (hash: string): Promise<boolean> => {
    try {
      return await blobStore.exists(hash);
    } catch (error) {
      return false;
    }
  }, [blobStore]);

  const getMetadata = useCallback(async (hash: string): Promise<BlobMetadata | null> => {
    try {
      return await blobStore.getMetadata(hash);
    } catch (error) {
      if (error instanceof BlossomError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }, [blobStore]);

  return {
    deleteBlob,
    checkExists,
    getMetadata,
  };
}

/**
 * Hook for generating and managing encryption keys
 */
export function useEncryptionKeys() {
  const [keys, setKeys] = useState<Map<string, Uint8Array>>(new Map());

  const generateNewKey = useCallback(async (id?: string): Promise<{ id: string; key: Uint8Array }> => {
    try {
      const key = await generateKey();
      const keyId = id || crypto.randomUUID();

      setKeys(prev => new Map(prev).set(keyId, key));

      return { id: keyId, key };
    } catch (error) {
      throw new EncryptionError(`Key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const getKey = useCallback((id: string): Uint8Array | null => {
    return keys.get(id) || null;
  }, [keys]);

  const removeKey = useCallback((id: string): void => {
    setKeys(prev => {
      const newKeys = new Map(prev);
      newKeys.delete(id);
      return newKeys;
    });
  }, []);

  const clearKeys = useCallback(() => {
    setKeys(new Map());
  }, []);

  return {
    generateNewKey,
    getKey,
    removeKey,
    clearKeys,
    keyCount: keys.size,
  };
}