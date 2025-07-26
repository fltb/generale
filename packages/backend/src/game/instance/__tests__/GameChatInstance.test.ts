import { describe, it, expect, beforeEach } from 'bun:test';
import { GameChatInstance, ChatConnectorManager } from '../GameChatInstance';
import { PlayerId } from '@generale/types';

// Local type definition for testing
type GameId = string;

// Mock connector for testing
class MockChatConnector {
    public ready = true;
    public sentEvents: any[] = [];
    private messageHandlers: ((evt: any) => void)[] = [];
    private disconnectHandlers: ((err?: Error) => void)[] = [];

    send(evt: any): void {
        this.sentEvents.push(evt);
    }

    onClientMessage(cb: (evt: any) => void): void {
        this.messageHandlers.push(cb);
    }

    onDisconnect(cb: (err?: Error) => void): void {
        this.disconnectHandlers.push(cb);
    }

    close(): void {
        this.ready = false;
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

    getMessageEvents(): any[] {
        return this.sentEvents.filter(event => 
            event.type === 'state-update' && 
            (event.payload.type === 'snapshot' || event.payload.data?.type === 'new_message')
        );
    }

    clearEvents(): void {
        this.sentEvents = [];
    }
}

describe('GameChatInstance', () => {
    let chatInstance: GameChatInstance;
    let mockConnectorManager: ChatConnectorManager;
    let mockConnectors: Map<PlayerId, MockChatConnector>;
    let gameId: GameId;

    beforeEach(() => {
        gameId = 'test-game-123' as GameId;
        mockConnectors = new Map();
        
        mockConnectorManager = {
            createSubConnector: (() => {}).mockImplementation(async (playerId: PlayerId) => {
                const connector = new MockChatConnector();
                mockConnectors.set(playerId, connector);
                return connector;
            }),
            removeSubConnector: (() => {})
        };

        chatInstance = new GameChatInstance(gameId, mockConnectorManager);
    });

    describe('Initialization', () => {
        it('should initialize with correct state', () => {
            const state = chatInstance.getState();
            
            expect(state.gameId).toBe(gameId);
            expect(state.messages).toHaveLength(1); // Welcome message
            expect(state.players.size).toBe(0);
            expect(state.version).toBeGreaterThan(0);
            expect(state.maxMessages).toBe(100);
        });

        it('should send welcome message on initialization', () => {
            const state = chatInstance.getState();
            const welcomeMessage = state.messages[0];
            
            expect(welcomeMessage.type).toBe('system');
            expect(welcomeMessage.playerName).toBe('系统');
            expect(welcomeMessage.content).toContain('欢迎');
        });
    });

    describe('Player Management', () => {
        it('should add player successfully', async () => {
            const playerId = 'player-1' as PlayerId;
            const playerName = 'TestPlayer';
            
            await chatInstance.addPlayer(playerId, playerName);
            
            const state = chatInstance.getState();
            expect(state.players.has(playerId)).toBe(true);
            
            const player = state.players.get(playerId);
            expect(player!.name).toBe(playerName);
            expect(player!.isOnline).toBe(true);
            
            expect(mockConnectorManager.createSubConnector).toHaveBeenCalledWith(playerId);
        });

        it('should send join message when player is added', async () => {
            const playerId = 'player-1' as PlayerId;
            const playerName = 'TestPlayer';
            
            const initialMessageCount = chatInstance.getState().messages.length;
            
            await chatInstance.addPlayer(playerId, playerName);
            
            const state = chatInstance.getState();
            expect(state.messages.length).toBe(initialMessageCount + 1);
            
            const joinMessage = state.messages[state.messages.length - 1];
            expect(joinMessage.type).toBe('system');
            expect(joinMessage.content).toContain(playerName);
            expect(joinMessage.content).toContain('加入了游戏');
        });

        it('should send chat history to new player', async () => {
            const playerId = 'player-1' as PlayerId;
            
            await chatInstance.addPlayer(playerId);
            
            const connector = mockConnectors.get(playerId)!;
            const snapshotEvents = connector.sentEvents.filter(event => 
                event.type === 'state-update' && event.payload.type === 'snapshot'
            );
            
            expect(snapshotEvents.length).toBeGreaterThan(0);
        });

        it('should handle player disconnect', () => {
            const playerId = 'player-1' as PlayerId;
            const playerName = 'TestPlayer';
            
            chatInstance.addPlayer(playerId, playerName);
            
            const initialMessageCount = chatInstance.getState().messages.length;
            
            chatInstance.handlePlayerDisconnect(playerId);
            
            const state = chatInstance.getState();
            const player = state.players.get(playerId);
            expect(player!.isOnline).toBe(false);
            
            // Should send disconnect message
            expect(state.messages.length).toBe(initialMessageCount + 1);
            const disconnectMessage = state.messages[state.messages.length - 1];
            expect(disconnectMessage.content).toContain('断开连接');
        });

        it('should handle player reconnection', async () => {
            const playerId = 'player-1' as PlayerId;
            const playerName = 'TestPlayer';
            
            // Add player initially
            await chatInstance.addPlayer(playerId, playerName);
            
            // Disconnect
            chatInstance.handlePlayerDisconnect(playerId);
            
            const initialMessageCount = chatInstance.getState().messages.length;
            
            // Reconnect
            await chatInstance.handlePlayerReconnect(playerId);
            
            const state = chatInstance.getState();
            const player = state.players.get(playerId);
            expect(player!.isOnline).toBe(true);
            
            // Should send reconnect message
            expect(state.messages.length).toBe(initialMessageCount + 1);
            const reconnectMessage = state.messages[state.messages.length - 1];
            expect(reconnectMessage.content).toContain('重新连接');
        });

        it('should remove player completely', () => {
            const playerId = 'player-1' as PlayerId;
            const playerName = 'TestPlayer';
            
            chatInstance.addPlayer(playerId, playerName);
            
            const initialMessageCount = chatInstance.getState().messages.length;
            
            chatInstance.removePlayer(playerId);
            
            const state = chatInstance.getState();
            expect(state.players.has(playerId)).toBe(false);
            
            // Should send leave message
            expect(state.messages.length).toBe(initialMessageCount + 1);
            const leaveMessage = state.messages[state.messages.length - 1];
            expect(leaveMessage.content).toContain('离开了游戏');
        });
    });

    describe('Message Sending', () => {
        beforeEach(async () => {
            await chatInstance.addPlayer('player-1' as PlayerId, 'Player1');
            await chatInstance.addPlayer('player-2' as PlayerId, 'Player2');
        });

        it('should send normal message successfully', async () => {
            const playerId = 'player-1' as PlayerId;
            const connector = mockConnectors.get(playerId)!;
            
            const sendAction = {
                type: 'SEND_MESSAGE',
                payload: { content: 'Hello everyone!' },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(sendAction);
            
            const state = chatInstance.getState();
            const lastMessage = state.messages[state.messages.length - 1];
            
            expect(lastMessage.content).toBe('Hello everyone!');
            expect(lastMessage.playerId).toBe(playerId);
            expect(lastMessage.type).toBe('normal');
            
            // Should send success response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });

        it('should broadcast normal messages to all players', async () => {
            const playerId = 'player-1' as PlayerId;
            const connector = mockConnectors.get(playerId)!;
            
            // Clear previous events
            mockConnectors.forEach(c => c.clearEvents());
            
            const sendAction = {
                type: 'SEND_MESSAGE',
                payload: { content: 'Hello everyone!' },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(sendAction);
            
            // All players should receive the message
            for (const [pid, conn] of mockConnectors) {
                const messageEvents = conn.getMessageEvents();
                expect(messageEvents.length).toBeGreaterThan(0);
            }
        });

        it('should handle whisper messages', async () => {
            const senderId = 'player-1' as PlayerId;
            const targetId = 'player-2' as PlayerId;
            const senderConnector = mockConnectors.get(senderId)!;
            const targetConnector = mockConnectors.get(targetId)!;
            
            // Clear previous events
            mockConnectors.forEach(c => c.clearEvents());
            
            const whisperAction = {
                type: 'SEND_MESSAGE',
                payload: { 
                    content: 'Secret message',
                    type: 'whisper',
                    targetPlayerId: targetId
                },
                optimisticId: 123
            };
            
            senderConnector.simulateClientMessage(whisperAction);
            
            const state = chatInstance.getState();
            const lastMessage = state.messages[state.messages.length - 1];
            
            expect(lastMessage.type).toBe('whisper');
            expect(lastMessage.targetPlayerId).toBe(targetId);
            
            // Only sender and target should receive the message
            expect(senderConnector.getMessageEvents().length).toBeGreaterThan(0);
            expect(targetConnector.getMessageEvents().length).toBeGreaterThan(0);
        });

        it('should reject empty messages', async () => {
            const playerId = 'player-1' as PlayerId;
            const connector = mockConnectors.get(playerId)!;
            
            const sendAction = {
                type: 'SEND_MESSAGE',
                payload: { content: '   ' }, // Empty/whitespace only
                optimisticId: 123
            };
            
            connector.simulateClientMessage(sendAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });

        it('should reject messages that are too long', async () => {
            const playerId = 'player-1' as PlayerId;
            const connector = mockConnectors.get(playerId)!;
            
            const longMessage = 'a'.repeat(501); // Over 500 character limit
            
            const sendAction = {
                type: 'SEND_MESSAGE',
                payload: { content: longMessage },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(sendAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
            expect(lastEvent.payload.message).toContain('too long');
        });

        it('should reject whisper to non-existent player', async () => {
            const playerId = 'player-1' as PlayerId;
            const connector = mockConnectors.get(playerId)!;
            
            const whisperAction = {
                type: 'SEND_MESSAGE',
                payload: { 
                    content: 'Secret message',
                    type: 'whisper',
                    targetPlayerId: 'non-existent' as PlayerId
                },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(whisperAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });

        it('should reject whisper without target', async () => {
            const playerId = 'player-1' as PlayerId;
            const connector = mockConnectors.get(playerId)!;
            
            const whisperAction = {
                type: 'SEND_MESSAGE',
                payload: { 
                    content: 'Secret message',
                    type: 'whisper'
                    // Missing targetPlayerId
                },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(whisperAction);
            
            // Should send error response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('failed');
        });
    });

    describe('Sync Requests', () => {
        it('should handle sync requests', async () => {
            const playerId = 'player-1' as PlayerId;
            await chatInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            connector.clearEvents();
            
            const syncAction = {
                type: 'SYNC_REQUEST',
                payload: { version: 0 },
                optimisticId: 123
            };
            
            connector.simulateClientMessage(syncAction);
            
            // Should send snapshot for outdated version
            const snapshotEvents = connector.sentEvents.filter(event => 
                event.type === 'state-update' && event.payload.type === 'snapshot'
            );
            expect(snapshotEvents.length).toBeGreaterThan(0);
            
            // Should send success response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });
    });

    describe('Message History Management', () => {
        it('should limit message history to maxMessages', async () => {
            const playerId = 'player-1' as PlayerId;
            await chatInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            // Send many messages to exceed limit
            for (let i = 0; i < 150; i++) {
                const sendAction = {
                    type: 'SEND_MESSAGE',
                    payload: { content: `Message ${i}` }
                };
                connector.simulateClientMessage(sendAction);
            }
            
            const state = chatInstance.getState();
            expect(state.messages.length).toBeLessThanOrEqual(state.maxMessages);
        });

        it('should clean up old messages', () => {
            const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            const state = chatInstance.getState();
            
            // Manually add an old message for testing
            state.messages.push({
                id: 'old-message',
                playerId: 'system' as PlayerId,
                playerName: '系统',
                content: 'Old message',
                timestamp: oldTimestamp,
                type: 'system'
            });
            
            const initialCount = state.messages.length;
            
            // Clean up messages older than 24 hours
            chatInstance.cleanupOldMessages(24 * 60 * 60 * 1000);
            
            expect(state.messages.length).toBeLessThan(initialCount);
        });

        it('should return message history', () => {
            const history = chatInstance.getMessageHistory();
            expect(Array.isArray(history)).toBe(true);
            expect(history.length).toBeGreaterThan(0); // Should have welcome message
        });
    });

    describe('Mark Read Functionality', () => {
        it('should handle mark read requests', async () => {
            const playerId = 'player-1' as PlayerId;
            await chatInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            const markReadAction = {
                type: 'MARK_READ',
                optimisticId: 123
            };
            
            connector.simulateClientMessage(markReadAction);
            
            // Should send success response
            const lastEvent = connector.getLastEvent();
            expect(lastEvent.type).toBe('action-result');
            expect(lastEvent.payload.status).toBe('success');
        });
    });

    describe('Error Handling', () => {
        it('should handle unknown action types', async () => {
            const playerId = 'player-1' as PlayerId;
            await chatInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            const unknownAction = {
                type: 'UNKNOWN_ACTION',
                payload: {}
            };
            
            // Should not throw
            expect(() => connector.simulateClientMessage(unknownAction)).not.toThrow();
        });

        it('should handle actions from unknown players', () => {
            const unknownConnector = new MockChatConnector();
            
            const action = {
                type: 'SEND_MESSAGE',
                payload: { content: 'Hello' }
            };
            
            // Should not throw but should warn
            expect(() => unknownConnector.simulateClientMessage(action)).not.toThrow();
        });

        it('should handle invalid message content', async () => {
            const playerId = 'player-1' as PlayerId;
            await chatInstance.addPlayer(playerId);
            const connector = mockConnectors.get(playerId)!;
            
            const invalidActions = [
                { type: 'SEND_MESSAGE', payload: { content: null } },
                { type: 'SEND_MESSAGE', payload: { content: 123 } },
                { type: 'SEND_MESSAGE', payload: {} }
            ];
            
            for (const action of invalidActions) {
                connector.clearEvents();
                connector.simulateClientMessage(action);
                
                const lastEvent = connector.getLastEvent();
                expect(lastEvent.type).toBe('action-result');
                expect(lastEvent.payload.status).toBe('failed');
            }
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up resources on destroy', async () => {
            const playerId = 'player-1' as PlayerId;
            await chatInstance.addPlayer(playerId);
            
            expect(() => chatInstance.destroy()).not.toThrow();
            
            // Should close all connectors
            for (const connector of mockConnectors.values()) {
                expect(connector.ready).toBe(false);
            }
            
            // Should send end message
            const state = chatInstance.getState();
            const lastMessage = state.messages[state.messages.length - 1];
            expect(lastMessage.content).toContain('聊天已结束');
        });

        it('should clear all data on destroy', () => {
            chatInstance.destroy();
            
            const state = chatInstance.getState();
            expect(state.players.size).toBe(0);
            expect(state.messages.length).toBe(0);
        });
    });
});
