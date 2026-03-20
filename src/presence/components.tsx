/**
 * React components for presence visualization
 * Provides UI components for showing user presence and cursors
 */

import React from 'react';
import type { UserPresence, CursorPosition } from './types.js';

export interface UserAvatarsProps {
  /** Array of remote users to display */
  remoteUsers: UserPresence[];
  /** Local user to display */
  localUser?: UserPresence | null;
  /** Maximum number of avatars to show before showing "+N" */
  maxVisible?: number;
  /** Size of avatars in pixels */
  size?: number;
  /** Show user names on hover */
  showNames?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Click handler for avatar */
  onAvatarClick?: (user: UserPresence) => void;
}

/**
 * Component that displays user avatars with their colors
 */
export function UserAvatars({
  remoteUsers,
  localUser,
  maxVisible = 5,
  size = 32,
  showNames = true,
  className = '',
  onAvatarClick,
}: UserAvatarsProps) {
  const allUsers = localUser ? [localUser, ...remoteUsers] : remoteUsers;
  const visibleUsers = allUsers.slice(0, maxVisible);
  const remainingCount = Math.max(0, allUsers.length - maxVisible);

  const avatarStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '2px solid white',
    marginLeft: '-8px',
    cursor: onAvatarClick ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${size * 0.4}px`,
    fontWeight: 'bold',
    color: 'white',
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  };

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '8px', // Offset the negative margin of first avatar
  };

  return (
    <div style={containerStyle} className={className}>
      {visibleUsers.map((user, index) => (
        <div
          key={user.clientId}
          style={{
            ...avatarStyle,
            backgroundColor: user.color,
            zIndex: visibleUsers.length - index,
          }}
          title={showNames ? user.name : undefined}
          onClick={() => onAvatarClick?.(user)}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      ))}

      {remainingCount > 0 && (
        <div
          style={{
            ...avatarStyle,
            backgroundColor: '#666',
            zIndex: 0,
          }}
          title={`+${remainingCount} more users`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

export interface RemoteCursorProps {
  /** User whose cursor to display */
  user: UserPresence;
  /** Current cursor position */
  position: CursorPosition;
  /** Show user label next to cursor */
  showLabel?: boolean;
  /** Custom cursor icon (defaults to text cursor) */
  cursorIcon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Custom styling */
  style?: React.CSSProperties;
}

/**
 * Component that renders a remote user's cursor
 * Generic implementation - editors should customize positioning
 */
export function RemoteCursor({
  user,
  position,
  showLabel = true,
  cursorIcon,
  className = '',
  style = {},
}: RemoteCursorProps) {
  const cursorStyle: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 1000,
    ...style,
  };

  // Position based on x/y coordinates (for spatial cursors)
  if (position.x !== undefined && position.y !== undefined) {
    cursorStyle.left = position.x;
    cursorStyle.top = position.y;
  }

  return (
    <div style={cursorStyle} className={className}>
      {/* Cursor indicator */}
      <div
        style={{
          width: '2px',
          height: '20px',
          backgroundColor: user.color,
          position: 'relative',
        }}
      >
        {cursorIcon || (
          <div
            style={{
              width: '0',
              height: '0',
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderBottom: `6px solid ${user.color}`,
              position: 'absolute',
              top: '-6px',
              left: '-3px',
            }}
          />
        )}
      </div>

      {/* User label */}
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            top: '-28px',
            left: '8px',
            backgroundColor: user.color,
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          {user.name}
        </div>
      )}
    </div>
  );
}

export interface PresenceIndicatorProps {
  /** User to show presence for */
  user: UserPresence;
  /** Online/offline status */
  isOnline: boolean;
  /** Size of indicator dot */
  size?: number;
  /** Show user name next to indicator */
  showName?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Component that shows online/offline status indicator
 */
export function PresenceIndicator({
  user,
  isOnline,
  size = 8,
  showName = false,
  className = '',
}: PresenceIndicatorProps) {
  const indicatorStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: isOnline ? '#22c55e' : '#6b7280',
    border: '2px solid white',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  };

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  if (!showName) {
    return <div style={indicatorStyle} className={className} />;
  }

  return (
    <div style={containerStyle} className={className}>
      <div style={indicatorStyle} />
      <span
        style={{
          fontSize: '14px',
          color: isOnline ? '#374151' : '#6b7280',
          fontWeight: isOnline ? '500' : 'normal',
        }}
      >
        {user.name}
      </span>
    </div>
  );
}

export interface UserSelectionProps {
  /** User whose selection to display */
  user: UserPresence;
  /** Selection range */
  selection: NonNullable<UserPresence['selection']>;
  /** Additional CSS classes */
  className?: string;
  /** Custom styling */
  style?: React.CSSProperties;
}

/**
 * Component that renders a remote user's text selection
 * Should be positioned by parent editor component
 */
export function UserSelection({
  user,
  selection: _selection,
  className = '',
  style = {},
}: UserSelectionProps) {
  const selectionStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: user.color,
    opacity: 0.3,
    pointerEvents: 'none',
    borderRadius: '2px',
    ...style,
  };

  return <div style={selectionStyle} className={className} />;
}

export interface CollaboratorListProps {
  /** Array of all users (local + remote) */
  users: UserPresence[];
  /** Local user pubkey to highlight */
  localUserPubkey?: string;
  /** Show online status indicators */
  showStatus?: boolean;
  /** Click handler for user items */
  onUserClick?: (user: UserPresence) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Component that displays a list of all collaborators
 */
export function CollaboratorList({
  users,
  localUserPubkey,
  showStatus = true,
  onUserClick,
  className = '',
}: CollaboratorListProps) {
  const now = Date.now();

  return (
    <div className={className}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6b7280' }}>
        Collaborators ({users.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {users.map(user => {
          const isLocal = user.pubkey === localUserPubkey;
          const isOnline = now - user.lastSeen < 30000; // 30 seconds

          return (
            <div
              key={user.clientId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '6px',
                backgroundColor: isLocal ? '#f3f4f6' : 'transparent',
                cursor: onUserClick ? 'pointer' : 'default',
                border: isLocal ? '1px solid #d1d5db' : '1px solid transparent',
              }}
              onClick={() => onUserClick?.(user)}
            >
              {/* User avatar */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: user.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: 'white',
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>

              {/* User name */}
              <span
                style={{
                  flex: 1,
                  fontSize: '14px',
                  color: '#374151',
                  fontWeight: isLocal ? '600' : 'normal',
                }}
              >
                {user.name}
                {isLocal && ' (You)'}
              </span>

              {/* Status indicator */}
              {showStatus && (
                <PresenceIndicator
                  user={user}
                  isOnline={isOnline}
                  size={6}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}