/**
 * Example usage of the presence module
 * This shows how to set up and use the presence awareness system
 */

import React, { useEffect, useState } from 'react';
import * as Y from 'yjs';
import {
  createAwareness,
  usePresence,
  UserAvatars,
  RemoteCursor,
  CollaboratorList,
  type PresenceConfig,
} from '@cloistr/collab-common/presence';

interface PresenceExampleProps {
  /** Nostr public key for the local user */
  userPubkey: string;
  /** Display name for the local user */
  userName: string;
  /** Optional shared Yjs document (if null, creates a new one) */
  sharedDoc?: Y.Doc;
}

export function PresenceExample({
  userPubkey,
  userName,
  sharedDoc,
}: PresenceExampleProps) {
  const [doc] = useState(() => sharedDoc || new Y.Doc());
  const [awareness] = useState(() => createAwareness(doc));
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const config: PresenceConfig = {
    pubkey: userPubkey,
    name: userName,
  };

  const {
    state,
    updateCursor,
    updateName,
    isReady,
  } = usePresence(awareness, config, {
    onUserJoin: (user) => {
      console.log('User joined:', user.name);
    },
    onUserLeave: (user) => {
      console.log('User left:', user.name);
    },
    onCursorUpdate: (user, cursor) => {
      console.log('Cursor update from:', user.name, cursor);
    },
  });

  // Track mouse movement and update cursor
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const position = { x: event.clientX, y: event.clientY };
      setMousePosition(position);

      if (isReady) {
        updateCursor(position);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [isReady, updateCursor]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      awareness.destroy();
    };
  }, [awareness]);

  if (!isReady) {
    return <div>Setting up presence...</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Top bar with user avatars */}
      <div
        style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          right: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'white',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 100,
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Presence Example</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
            Move your mouse to see your cursor position
          </p>
        </div>

        <UserAvatars
          remoteUsers={state.remoteUsers}
          localUser={state.localUser}
          maxVisible={5}
          showNames={true}
          onAvatarClick={(user) => {
            console.log('Clicked user:', user.name);
          }}
        />
      </div>

      {/* Sidebar with collaborator list */}
      <div
        style={{
          position: 'fixed',
          top: '100px',
          left: '10px',
          width: '250px',
          backgroundColor: 'white',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 100,
        }}
      >
        <CollaboratorList
          users={[
            ...(state.localUser ? [state.localUser] : []),
            ...state.remoteUsers,
          ]}
          localUserPubkey={userPubkey}
          showStatus={true}
          onUserClick={(user) => {
            console.log('Selected user:', user.name);
          }}
        />

        {/* Local user controls */}
        <div style={{ marginTop: '16px', padding: '8px 0', borderTop: '1px solid #e5e5e5' }}>
          <input
            type="text"
            placeholder="Change your name..."
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                const newName = e.currentTarget.value.trim();
                if (newName) {
                  updateName(newName);
                  e.currentTarget.value = '';
                }
              }
            }}
            style={{
              width: '100%',
              padding: '6px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>
      </div>

      {/* Remote cursors */}
      {state.remoteUsers.map(user =>
        user.cursor && user.cursor.x !== undefined && user.cursor.y !== undefined ? (
          <RemoteCursor
            key={user.clientId}
            user={user}
            position={user.cursor}
            showLabel={true}
          />
        ) : null
      )}

      {/* Local cursor indicator */}
      {state.localUser && (
        <div
          style={{
            position: 'absolute',
            left: mousePosition.x + 10,
            top: mousePosition.y - 30,
            backgroundColor: state.localUser.color,
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {state.localUser.name} (You)
        </div>
      )}

      {/* Info overlay */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: 'white',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          fontSize: '14px',
          color: '#666',
        }}
      >
        <div>Mouse: ({mousePosition.x}, {mousePosition.y})</div>
        <div>Connected users: {state.userCount}</div>
        <div>Your pubkey: {userPubkey.slice(0, 8)}...</div>
      </div>
    </div>
  );
}

// Example usage in an app
export function App() {
  const userPubkey = "example_pubkey_here"; // Replace with real pubkey
  const userName = "John Doe"; // Replace with real name

  return (
    <PresenceExample
      userPubkey={userPubkey}
      userName={userName}
    />
  );
}