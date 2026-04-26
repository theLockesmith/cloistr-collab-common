/**
 * @fileoverview Share dialog component for document sharing
 * Provides interface for creating pubkey shares and link shares
 */

import React, { useState, useCallback } from 'react';
import type { ShareDialogProps } from './types.js';
import type { PermissionLevel, ShareLink } from '../sharing/types.js';
import { isShareValid } from '../sharing/utils.js';

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format pubkey for display (truncated)
 */
function formatPubkey(pubkey: string): string {
  if (pubkey.length <= 16) return pubkey;
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

/**
 * Permission level labels
 */
const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  none: 'No access',
  view: 'Can view',
  comment: 'Can comment',
  edit: 'Can edit',
  admin: 'Admin',
};

/**
 * Share dialog component
 */
export function ShareDialog({
  isOpen,
  onClose,
  docId: _docId,
  docTitle,
  shares,
  permission,
  onCreateShare,
  onCreateLink,
  onRevokeShare,
  onUpdateShare,
  className = '',
  style = {},
}: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'people' | 'link'>('people');
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [selectedPermission, setSelectedPermission] = useState<PermissionLevel>('view');
  const [linkExpiry, setLinkExpiry] = useState<'never' | '1day' | '7days' | '30days'>('never');
  const [linkMaxViews, setLinkMaxViews] = useState<number | undefined>(undefined);
  const [generatedLink, setGeneratedLink] = useState<ShareLink | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canManageShares = permission === 'admin';

  const handleCreateShare = useCallback(async () => {
    if (!recipientPubkey.trim()) {
      setError('Please enter a pubkey');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onCreateShare(recipientPubkey.trim(), selectedPermission);
      setRecipientPubkey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share');
    } finally {
      setIsLoading(false);
    }
  }, [recipientPubkey, selectedPermission, onCreateShare]);

  const handleCreateLink = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let expiresAt: number | undefined;
      if (linkExpiry !== 'never') {
        const days = linkExpiry === '1day' ? 1 : linkExpiry === '7days' ? 7 : 30;
        expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
      }

      const link = await onCreateLink(selectedPermission, expiresAt, linkMaxViews);
      setGeneratedLink(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPermission, linkExpiry, linkMaxViews, onCreateLink]);

  const handleCopyLink = useCallback(async () => {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [generatedLink]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const dialogStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    width: '480px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    ...style,
  };

  const headerStyle: React.CSSProperties = {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    border: 'none',
    backgroundColor: isActive ? '#3b82f6' : 'transparent',
    color: isActive ? '#ffffff' : '#6b7280',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '14px',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#3b82f6',
    color: '#ffffff',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} className={className} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              Share {docTitle ? `"${docTitle}"` : 'Document'}
            </h2>
            <button
              onClick={onClose}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280' }}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={tabStyle(activeTab === 'people')} onClick={() => setActiveTab('people')}>
              Share with people
            </button>
            <button style={tabStyle(activeTab === 'link')} onClick={() => setActiveTab('link')}>
              Get link
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(80vh - 200px)' }}>
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '6px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {activeTab === 'people' && (
            <div>
              {/* Add person form */}
              {canManageShares && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    Add person by pubkey
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="npub1... or hex pubkey"
                      value={recipientPubkey}
                      onChange={(e) => setRecipientPubkey(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <select
                      value={selectedPermission}
                      onChange={(e) => setSelectedPermission(e.target.value as PermissionLevel)}
                      style={{ ...inputStyle, width: '120px' }}
                    >
                      <option value="view">View</option>
                      <option value="comment">Comment</option>
                      <option value="edit">Edit</option>
                    </select>
                    <button
                      onClick={handleCreateShare}
                      disabled={isLoading}
                      style={{ ...primaryButtonStyle, opacity: isLoading ? 0.7 : 1 }}
                    >
                      {isLoading ? '...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing shares */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px', color: '#374151' }}>
                  People with access ({shares.filter(s => s.type === 'pubkey').length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shares.filter(s => s.type === 'pubkey').map((share) => (
                    <div
                      key={share.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        opacity: isShareValid(share) ? 1 : 0.5,
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                          {formatPubkey(share.recipientPubkey || '')}
                        </div>
                        {share.label && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{share.label}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {onUpdateShare && canManageShares ? (
                          <select
                            value={share.permission}
                            onChange={(e) => onUpdateShare(share.id, e.target.value as PermissionLevel)}
                            style={{ ...inputStyle, width: '100px', padding: '4px 8px' }}
                          >
                            <option value="view">View</option>
                            <option value="comment">Comment</option>
                            <option value="edit">Edit</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: '13px', color: '#6b7280' }}>
                            {PERMISSION_LABELS[share.permission]}
                          </span>
                        )}
                        {canManageShares && (
                          <button
                            onClick={() => onRevokeShare(share.id)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}
                            title="Remove"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {shares.filter(s => s.type === 'pubkey').length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
                      No one has access yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'link' && (
            <div>
              {/* Link generation */}
              {canManageShares && !generatedLink && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                      Permission
                    </label>
                    <select
                      value={selectedPermission}
                      onChange={(e) => setSelectedPermission(e.target.value as PermissionLevel)}
                      style={inputStyle}
                    >
                      <option value="view">Can view</option>
                      <option value="comment">Can comment</option>
                      <option value="edit">Can edit</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                      Expiration
                    </label>
                    <select
                      value={linkExpiry}
                      onChange={(e) => setLinkExpiry(e.target.value as any)}
                      style={inputStyle}
                    >
                      <option value="never">Never expires</option>
                      <option value="1day">1 day</option>
                      <option value="7days">7 days</option>
                      <option value="30days">30 days</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                      Max views (optional)
                    </label>
                    <input
                      type="number"
                      placeholder="Unlimited"
                      min={1}
                      value={linkMaxViews || ''}
                      onChange={(e) => setLinkMaxViews(e.target.value ? parseInt(e.target.value) : undefined)}
                      style={inputStyle}
                    />
                  </div>

                  <button
                    onClick={handleCreateLink}
                    disabled={isLoading}
                    style={{ ...primaryButtonStyle, width: '100%', opacity: isLoading ? 0.7 : 1 }}
                  >
                    {isLoading ? 'Creating...' : 'Create link'}
                  </button>
                </div>
              )}

              {/* Generated link */}
              {generatedLink && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
                    Share link
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={generatedLink.url}
                      readOnly
                      style={{ ...inputStyle, flex: 1, backgroundColor: '#f9fafb' }}
                    />
                    <button
                      onClick={handleCopyLink}
                      style={primaryButtonStyle}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                    Anyone with this link can {selectedPermission} this document.
                    {generatedLink.expiresAt && ` Expires ${formatDate(generatedLink.expiresAt)}.`}
                  </p>
                  <button
                    onClick={() => setGeneratedLink(null)}
                    style={{ ...buttonStyle, marginTop: '12px', backgroundColor: '#f3f4f6', color: '#374151' }}
                  >
                    Create another link
                  </button>
                </div>
              )}

              {/* Existing link shares */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px', color: '#374151' }}>
                  Active links ({shares.filter(s => s.type === 'link').length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shares.filter(s => s.type === 'link').map((share) => (
                    <div
                      key={share.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        opacity: isShareValid(share) ? 1 : 0.5,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>
                          {PERMISSION_LABELS[share.permission]}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Created {formatDate(share.createdAt)}
                          {share.expiresAt && ` · Expires ${formatDate(share.expiresAt)}`}
                          {share.maxViews && ` · ${share.viewCount}/${share.maxViews} views`}
                        </div>
                      </div>
                      {canManageShares && (
                        <button
                          onClick={() => onRevokeShare(share.id)}
                          style={{ ...buttonStyle, backgroundColor: '#fef2f2', color: '#991b1b' }}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                  {shares.filter(s => s.type === 'link').length === 0 && (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
                      No active links
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
