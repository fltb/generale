import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PreGameInstance, PreGameConnectorManager, PreGameSettings } from '../PreGameInstance';
import { PlayerId, ServerSyncConnector } from '@generale/types';

// Local type definition for testing
type GameId = string;
import { MockWebSocket } from '../../service/__tests__/test-utils';

// Mock connector for testing
class MockServerSyncConnector implements ServerSyncConnector<any, any> {
    public ready = true;
    public sentEvents: any[] = [];
    private messageHandlers: ((evt: any) => void)[] = [];
    private openHandlers: (() => void)[] = [];
    private closeHandlers: ((code: number, reason: string) => void)[] = [];
    private disconnectHandlers: ((err?: Error) => void)[] = [];
    private reconnectHandlers: (() => void)[] = [];

    send(evt: any): void {
        this.sentEvents.push(evt);
    }

    onClientMessage(cb: (evt: any) => void): void {
        this.messageHandlers.push(cb);
    }

    onOpen(cb: () => void): void {
        this.openHandlers.push(cb);
        cb(); // Immediately call as if connection is open
    }

    onClose(cb: (code: number, reason: string) => void): void {
        this.closeHandlers.push(cb);
    }

    onDisconnect(cb: (err?: Error) => void): void {
        this.disconnectHandlers.push(cb);
    }

    onReconnect(cb: () => void): void {
        this.reconnectHandlers.push(cb);
    }

    close(code?: number, reason?: string): void {
        this.ready = false;
        this.closeHandlers.forEach(handler => handler(code || 1000, reason || 'Normal closure'));
    }

    // Test helpers
    simulateClientMessage(message: any): void {
        this.messageHandlers.forEach(handler => handler(message));
    }

    simulateDisconnect(error?: Error): void {
        this.disconnectHandlers.forEach(handler => handler(error));
    }

    getLastEvent(): any {
        return this.sentEvents[this.sentEvents.length - 1];
    }

    clearEvents(): void {
        this.sentEvents = [];
    }
}

describe('PreGameInstance', () => {
    let preGameInstance: PreGameInstance;
    let mockConnectorManager: PreGameConnectorManager;
    let mockConnectors: Map<PlayerId, MockServerSyncConnector>;
    let gameId: GameId;
    let hostId: PlayerId;
    let initialSettings: PreGameSettings;

    beforeEach(() => {
        gameId = 'test-game-123' as GameId;
        hostId = 'host-player' as PlayerId;
        mockConnectors = new Map();
        
        initialSettings = {
            mapSize: 'medium',
            maxPlayers: 4,
            gameMode: 'classic',
            timeLimit: 1800000
        };

        mockConnectorManager = {
            createSubConnector: (() => {}).mockImplementation(async (playerId: PlayerId) => {
                const connector = new MockServerSyncConnector();
                mockConnectors.set(playerId, connector);
                return connector;
            }),
            removeSubConnector: (() => {}),
            onGameStart: (() => {})
        };

        preGameInstance = new PreGameInstance(
            gameId,
            hostId,
            initialSettings,
            mockConnectorManager
        );
    });

    describe('Initialization', () => {
        it('should initialize with correct state', () => {
            const state = preGameInstance.getState();
            
            expect(state.gameId).toBe(gameId);
            expect(state.hostId).toBe(hostId);
            expect(state.status).toBe('waiting');
            expect(state.settings).toEqual(initialSettings);
            expect(state.players.has(hostId)).toBe(true);
            expect(state.canStart).toBe(false);
            expect(state.version).toBe(0);
        });

        it('should set host player correctly', () => {
            const state = preGameInstance.getState();
            const hostPlayer = state.players.get(hostId);
            
            expect(hostPlayer).toBeDefined();
            expect(hostPlayer!.isHost).toBe(true);
            expect(hostPlayer!.isReady).toBe(false);
            expect(hostPlayer!.playerId).toBe(hostId);
        });
    });

    describe('Player Management', () => {
        it('should add player successfully', async () => {
            const playerId = 'player-1' as PlayerId;
            
            await preGameInstance.addPlayer(playerId);
            
            const state = preGameInstance.getState();
            expect(state.players.has(playerId)).toBe(true);
            
            const player = state.players.get(playerId);
            expect(player!.isHost).toBe(false);
            expect(player!.isReady).toBe(false);
            expect(mockConnectorManager.createSubConnector).toHaveBeenCalledWith(playerId);
        });

        it('should not add duplicate players', async () => {
            const playerId = 'player-1' as PlayerId;
            
            await preGameInstance.addPlayer(playerId);
            await preGameInstance.addPlayer(playerId); // Should not throw
            
            const state = preGameInstance.getState();
            expect(state.players.size).toBe(2); // Host + 1 player
        });

        it('should reject players when game is full', async () => {
            // Fill the game to max capacity
            for (let i = 1; i < initialSettings.maxPlayers; i++) {
                await preGameInstance.addPlayer(`player-${i}` as PlayerId);
            }
            
            // Try to add one more
            await expect(preGameInstance.addPlayer('extra-player' as PlayerId))
                .rejects.toThrow('Game is full');
        });

        it('should handle player disconnect', () => {
            const playerId = 'player-1' as PlayerId;
            
            // First add the player
            preGameInstance.addPlayer(playerId);
            
            // Then disconnect
            preGameInstance.handlePlayerDisconnect(playerId);
            
            const state = preGameInstance.getState();
            expect(state.players.has(playerId)).toBe(false);
            expect(mockConnectorManager.removeSubConnector).toHaveBeenCalledWith(playerId);
        });

        it('should transfer host when host disconnects', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            
            // Host disconnects
            preGameInstance.handlePlayerDisconnect(hostId);
            
            const state = preGameInstance.getState();
            expect(state.hostId).toBe(playerId);
            
            const newHost = state.players.get(playerId);
            expect(newHost!.isHost).toBe(true);
            expect(newHost!.isReady).toBe(false); // New host doesn't need to be ready
        });
    });

    describe('Settings Management', () => {
        it('should allow host to update settings', async () => {
            await preGameInstance.addPlayer(hostId); // Ensure host has connector
            const connector = mockConnectors.get(hostId)!;
            
            const updateAction = {
                type: 'UPDATE_SETTINGS',
                payload: { key: 'mapSize', value: 'large' },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(updateAction);
            
            const state = preGameInstance.getState();
            expect(state.settings.mapSize).toBe('large');
            expect(state.version).toBeGreaterThan(0);
            
            // Should send success response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
            expect(lastEvent.payload.optimisticId).toBe(123);
        });

        it('should reject settings update from non-host', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            const updateAction = {
                type: 'UPDATE_SETTINGS',
                payload: { key: 'mapSize', value: 'large' },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(updateAction);
            
            const state = preGameInstance.getState();
            expect(state.settings.mapSize).toBe('medium'); // Should not change
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });

        it('should reject invalid setting keys', async () => {
            await preGameInstance.addPlayer(hostId);
            const connector = mockConnectors.get(hostId)!;
            
            const updateAction = {
                type: 'UPDATE_SETTINGS',
                payload: { key: 'invalidKey', value: 'value' },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(updateAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });
    });

    describe('Ready State Management', () => {
        it('should allow non-host players to toggle ready', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            const readyAction = {
                type: 'TOGGLE_READY',
                optimisticId: 123
            };
            
            connector.simulateClientMessage(readyAction);
            
            const state = preGameInstance.getState();
            const player = state.players.get(playerId);
            expect(player!.isReady).toBe(true);
            
            // Should send success response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });

        it('should reject ready toggle from host', async () => {
            await preGameInstance.addPlayer(hostId);
            const connector = mockConnectors.get(hostId)!;
            
            const readyAction = {
                type: 'TOGGLE_READY',
                optimisticId: 123
            };
            
            connector.simulateClientMessage(readyAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });

        it('should update canStart when all players are ready', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            // Player becomes ready
            connector.simulateClientMessage({ type: 'TOGGLE_READY' });
            
            const state = preGameInstance.getState();
            expect(state.canStart).toBe(true);
        });

        it('should not allow start with only one player', () => {
            const state = preGameInstance.getState();
            expect(state.canStart).toBe(false);
        });
    });

    describe('Game Start', () => {
        it('should allow host to start game when conditions are met', async () => {
            // Add a player and make them ready
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            const playerConnector = mockConnectors.get(playerId)!;
            playerConnector.simulateClientMessage({ type: 'TOGGLE_READY' });
            
            // Host starts the game
            await preGameInstance.addPlayer(hostId);
            const hostConnector = mockConnectors.get(hostId)!;
            
            const startAction = {
                type: 'START_GAME',
                optimisticId: 123
            };
            
            hostConnector.simulateClientMessage(startAction);
            
            const state = preGameInstance.getState();
            expect(state.status).toBe('starting');
            
            // Should send success response
            const lastEvent = hostConnector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });

        it('should reject game start when not all players are ready', async () => {
            // Add a player but don't make them ready
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            
            await preGameInstance.addPlayer(hostId);
            const hostConnector = mockConnectors.get(hostId)!;
            
            const startAction = {
                type: 'START_GAME',
                optimisticId: 123
            };
            
            hostConnector.simulateClientMessage(startAction);
            
            // Should send error response
            const lastEvent = hostConnector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });

        it('should reject game start from non-host', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            const startAction = {
                type: 'START_GAME',
                optimisticId: 123
            };
            
            connector.simulateClientMessage(startAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });
    });

    describe('Player Kicking', () => {
        it('should allow host to kick players', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            
            await preGameInstance.addPlayer(hostId);
            const hostConnector = mockConnectors.get(hostId)!;
            
            const kickAction = {
                type: 'KICK_PLAYER',
                payload: { targetPlayerId: playerId },
                optimisticId: 123
            };
            
            hostConnector.simulateClientMessage(kickAction);
            
            const state = preGameInstance.getState();
            expect(state.players.has(playerId)).toBe(false);
            
            // Should send success response
            const lastEvent = hostConnector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });

        it('should reject kick from non-host', async () => {
            const playerId1 = 'player-1' as PlayerId;
            const playerId2 = 'player-2' as PlayerId;
            
            await preGameInstance.addPlayer(playerId1);
            await preGameInstance.addPlayer(playerId2);
            
            const connector = mockConnectors.get(playerId1)!;
            
            const kickAction = {
                type: 'KICK_PLAYER',
                payload: { targetPlayerId: playerId2 },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(kickAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });

        it('should reject self-kick', async () => {
            await preGameInstance.addPlayer(hostId);
            const hostConnector = mockConnectors.get(hostId)!;
            
            const kickAction = {
                type: 'KICK_PLAYER',
                payload: { targetPlayerId: hostId },
                optimisticId: 123
            };
            
            hostConnector.simulateClientMessage(kickAction);
            
            // Should send error response
            const lastEvent = hostConnector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });
    });

    describe('Sync Requests', () => {
        it('should handle sync requests', async () => {
            await preGameInstance.addPlayer(hostId);
            const connector = mockConnectors.get(hostId)!;
            
            const syncAction = {
                type: 'SYNC_REQUEST',
                payload: { version: 0 },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(syncAction);
            
            // Should send state update and success response
            expect(connector.sentEvents.length).toBeGreaterThan(0);
            
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });

        it('should send snapshot for outdated clients', async () => {
            await preGameInstance.addPlayer(hostId);
            const connector = mockConnectors.get(hostId)!;
            
            // Clear previous events
            connector.clearEvents();
            
            const syncAction = {
                type: 'SYNC_REQUEST',
                payload: { version: -1 }, // Outdated version
                optimisticId: 123
            };
            
            connector.simulateClientMessage(syncAction);
            
            // Should send state update
            const stateUpdate = connector.sentEvents.find(event => 
                event.type === 'state-update' && 
                event.payload.type === 'snapshot'
            );
            expect(stateUpdate).toBeDefined();
        });
    });

    describe('Reconnection Handling', () => {
        it('should handle player reconnection', async () => {
            const playerId = 'player-1' as PlayerId;
            await preGameInstance.addPlayer(playerId);
            
            // Clear the connector to simulate disconnect
            mockConnectors.delete(playerId);
            
            // Reconnect
            await preGameInstance.handlePlayerReconnect(playerId);
            
            expect(mockConnectorManager.createSubConnector).toHaveBeenCalledWith(playerId);
            
            // Should send current state
            const connector = mockConnectors.get(playerId)!;
            expect(connector.sentEvents.length).toBeGreaterThan(0);
        });

        it('should reject reconnection for unknown players', async () => {
            const unknownPlayerId = 'unknown-player' as PlayerId;
            
            // Should not throw but should warn
            await expect(preGameInstance.handlePlayerReconnect(unknownPlayerId))
                .resolves.not.toThrow();
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up resources on destroy', () => {
            expect(() => preGameInstance.destroy()).not.toThrow();
            
            // Should close all connectors
            for (const connector of mockConnectors.values()) {
                expect(connector.ready).toBe(false);
            }
        });

        it('should destroy when all players leave', async () => {
            const destroySpy = (() => {});
            
            // Remove the host (only player)
            preGameInstance.handlePlayerDisconnect(hostId);
            
            expect(destroySpy).toHaveBeenCalled();
        });
    });
});
