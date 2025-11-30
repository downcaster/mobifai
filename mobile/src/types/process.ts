/**
 * Types for multi-process terminal management
 */

/**
 * Represents a terminal process on the iOS client
 */
export interface TerminalProcess {
  /** Unique identifier generated on iOS */
  uuid: string;
  /** Timestamp when the process was created */
  createdAt: number;
  /** Display label for the tab (e.g., "Tab 1", shortened UUID) */
  label: string;
}

/**
 * Payload for process:create command (iOS -> Mac)
 */
export interface ProcessCreatePayload {
  uuid: string;
  cols?: number;
  rows?: number;
}

/**
 * Payload for process:terminate command (iOS -> Mac)
 */
export interface ProcessTerminatePayload {
  uuid: string;
}

/**
 * Payload for process:switch command (iOS -> Mac)
 */
export interface ProcessSwitchPayload {
  activeUuids: string[];
}

/**
 * Payload for process:created event (Mac -> iOS)
 */
export interface ProcessCreatedPayload {
  uuid: string;
}

/**
 * Payload for process:terminated event (Mac -> iOS)
 */
export interface ProcessTerminatedPayload {
  uuid: string;
}

/**
 * Payload for process:exited event (Mac -> iOS)
 */
export interface ProcessExitedPayload {
  uuid: string;
}

/**
 * Payload for process:screen event (Mac -> iOS)
 * Contains the screen snapshot when switching to a process
 */
export interface ProcessScreenPayload {
  uuid: string;
  data: string;
}

/**
 * Payload for process:error event (Mac -> iOS)
 */
export interface ProcessErrorPayload {
  uuid: string;
  error: string;
}

/**
 * Payload for terminal:input command with process uuid (iOS -> Mac)
 */
export interface TerminalInputPayload {
  uuid: string;
  data: string;
}

/**
 * Payload for terminal:output event with process uuid (Mac -> iOS)
 */
export interface TerminalOutputPayload {
  uuid: string;
  data: string;
}

/**
 * Payload for terminal:resize command with optional process uuid
 */
export interface TerminalResizePayload {
  uuid?: string;
  cols: number;
  rows: number;
}

