// Defines the server-side "sync connector" interface
export interface ServerSyncConnector<CEvt, SEvt> {
  /** Whether the current connection is ready */
  readonly ready: boolean;

  /** Send an event to the client
   * Behavior of send() during disconnect is currently considered UB (undefined behavior)
   */
  send(evt: SEvt): void;

  /** Register callback for client events */
  onClientMessage(cb: (evt: CEvt) => void): void;

  /** Triggered when connection is first established or successfully reconnected */
  onOpen(cb: () => void): void;

  /** Triggered when connection is actively closed (either server or client decides to terminate) */
  onClose(cb: (code: number, reason: string) => void): void;

  /**
   * Callback when underlying network disconnects unexpectedly (timeout, broken link, reset etc.)
   * onClose doesn't trigger resource cleanup, UI can show "reconnecting" state here.
   */
  onDisconnect(cb: (err?: Error) => void): void;

  /**
   * Triggered when automatic reconnection succeeds after onDisconnect.
   * Can be used to restore heartbeat, resend lost messages, sync state etc.
   */
  onReconnect(cb: () => void): void;

  /** Actively close the connection */
  close(code?: number, reason?: string): void;
}

// Defines the client-side "sync connector" interface
export interface SyncConnector<CEvt, SEvt> {
  /** Whether the underlying connection is ready for bidirectional communication */
  readonly ready: boolean;

  /** Actively close (normal shutdown after bilateral negotiation) */
  close(code?: number, reason?: string): void;

  /** Send event */
  send(evt: CEvt): void;

  // —— Callback registration ——

  /**
   * Callback when underlying connection is established or successfully reconnected after unexpected disconnect.
   * Note: Includes both initial onopen and successful reconnections.
   */
  onOpen(cb: () => void): void;

  /**
   * Callback when "negotiated close" or when either side actively calls close().
   * Upper layer should release resources and stop heartbeat timers here.
   */
  onClose(cb: (code?: number, reason?: string) => void): void;

  /**
   * Callback when underlying network disconnects unexpectedly (timeout, broken link, reset etc.)
   * onClose doesn't trigger resource cleanup, UI can show "reconnecting" state here.
   */
  onDisconnect(cb: (err?: Error) => void): void;

  /**
   * Triggered when automatic reconnection succeeds after onDisconnect.
   * Can be used to restore heartbeat, resend lost messages, sync state etc.
   */
  onReconnect(cb: () => void): void;

  /** Received message from peer */
  onMessage(cb: (evt: SEvt) => void): void;
}
