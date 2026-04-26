/**
 * @fileoverview Shared React components for Cloistr collaboration apps
 * Provides Toolbar, ShareDialog, and status indicators
 */

// Export types
export type {
  BaseComponentProps,
  ToolbarProps,
  ShareDialogProps,
  VersionHistoryProps,
  ConnectionStatusProps,
  SaveStatusProps,
} from './types.js';

// Export components
export { Toolbar } from './Toolbar.js';
export { ShareDialog } from './ShareDialog.js';
export { ConnectionStatus, SaveStatus, VersionHistory } from './StatusIndicators.js';
