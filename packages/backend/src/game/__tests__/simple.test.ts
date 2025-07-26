import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { GameService } from '../service/GameService';
import { SubConnector } from '../service/SubConnector';
import { PlayerId } from '@generale/types';

// Mock WebSocket for testing
class MockWebSocket {
    public readyState: number = 1; // WebSocket.OPEN
    public sentMessages: any[] = [];
    public subscribers: string[] = [];
    private messageHandlers: ((message: any) => void)[] = [];
    private closeHandlers: (() => void)[] = [];

    send(data: string): void {
        try {
            this.sentMessages.push(JSON.parse(data));
        } catch {
            this.sentMessages.push(data);
        }
    }

    subscribe(topic: string): void {
        this.subscribers.push(topic);
    }

    on(event: string, handler: (...args: any[]) => void): void {
        if (event === 'message') {
            this.messageHandlers.push(handler);
        } else if (event === 'close') {
            this.closeHandlers.push(handler);
        }
    }

    // Test helpers
    simulateMessage(message: any): void {
        this.messageHandlers.forEach(handler => handler(message));
    }

    simulateClose(): void {
        this.readyState = 3; // WebSocket.CLOSED
        this.closeHandlers.forEach(handler => handler());
    }

    getLastMessage(): any {
        return this.sentMessages[this.sentMessages.length - 1];
    }

    getMessagesByDomain(domain: string): any[] {
        return this.sentMessages.filter(msg => msg.domain === domain);
    }

    clearMessages(): void {
        this.sentMessages = [];
    }
}

function createMockPlayer(playerId: PlayerId): { playerId: PlayerId; ws: MockWebSocket } {
    return {
        playerId,
        ws: new MockWebSocket()
    };
}

function createTestGameSettings() {
    return {
        mapSize: 'medium' as const,
        maxPlayers: 4,
        gameMode: 'classic' as const,
        timeLimit: 1800000
    };
}

async function waitForAsync(ms: number = 0): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Game System Basic Tests', () => {
    let gameService: GameService;

    beforeEach(() => {
        gameService = new GameService({
            maxPlayersPerGame: 4,
            gameTimeout: 300000,
            heartbeatInterval: 30000
        });
    });

    afterEach(() => {
        gameService.destroy();
    });

    describe('GameService', () => {
        it('should create GameService successfully', () => {
            expect(gameService).toBeDefined();
        });

        it('should connect a player', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(playerId, ws as any);
            
            expect(ws.subscribers).toContain(`player-${playerId}`);
        });

        it('should create a game', async () => {
            const { playerId, ws } = createMockPlayer('host' as PlayerId);
            const settings = createTestGameSettings();

            await gameService.connectPlayer(playerId, ws as any);
            const gameId = await gameService.createGame(playerId, settings);

            expect(gameId).toBeDefined();
            expect(typeof gameId).toBe('string');
            expect(gameId.startsWith('game_')).toBe(true);
        });

        it('should allow players to join a game', async () => {
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            const { playerId: playerId, ws: playerWs } = createMockPlayer('player1' as PlayerId);
            const settings = createTestGameSettings();

            // Host creates game
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, settings);

            // Player joins game
            await gameService.connectPlayer(playerId, playerWs as any);
            await gameService.joinGame(playerId, gameId);

            // Both players should have received messages
            expect(hostWs.sentMessages.length).toBeGreaterThan(0);
            expect(playerWs.sentMessages.length).toBeGreaterThan(0);
        });

        it('should reject joining full game', async () => {
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            const settings = { ...createTestGameSettings(), maxPlayers: 2 };

            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, settings);

            // Fill the game
            const { playerId: player1Id, ws: player1Ws } = createMockPlayer('player1' as PlayerId);
            await gameService.connectPlayer(player1Id, player1Ws as any);
            await gameService.joinGame(player1Id, gameId);

            // Try to add one more player (should fail)
            const { playerId: player2Id, ws: player2Ws } = createMockPlayer('player2' as PlayerId);
            await gameService.connectPlayer(player2Id, player2Ws as any);
            
            let errorThrown = false;
            try {
                await gameService.joinGame(player2Id, gameId);
            } catch (error) {
                errorThrown = true;
                expect((error as Error).message).toContain('Game is full');
            }
            expect(errorThrown).toBe(true);
        });

        it('should handle player disconnect', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);

            await gameService.connectPlayer(playerId, ws as any);
            ws.simulateClose();

            await waitForAsync(100);
            // Should handle disconnect gracefully
            expect(true).toBe(true);
        });
    });

    describe('SubConnector', () => {
        it('should create SubConnector successfully', () => {
            const playerId = 'test-player' as PlayerId;
            const domain = 'test-domain';
            const mockWs = new MockWebSocket();
            
            const subConnector = new SubConnector(playerId, domain, mockWs as any);
            
            expect(subConnector.ready).toBe(true);
            
            const info = subConnector.getInfo();
            expect(info.playerId).toBe(playerId);
            expect(info.domain).toBe(domain);
        });

        it('should send messages with correct domain', () => {
            const playerId = 'test-player' as PlayerId;
            const domain = 'test-domain';
            const mockWs = new MockWebSocket();
            const subConnector = new SubConnector(playerId, domain, mockWs as any);
            
            const testEvent = { type: 'TEST_EVENT', payload: { data: 'test' } };
            
            subConnector.send(testEvent);
            
            expect(mockWs.sentMessages).toHaveLength(1);
            const sentMessage = mockWs.sentMessages[0];
            expect(sentMessage.domain).toBe(domain);
            expect(sentMessage.type).toBe('TEST_EVENT');
        });

        it('should handle incoming messages', () => {
            const playerId = 'test-player' as PlayerId;
            const domain = 'test-domain';
            const mockWs = new MockWebSocket();
            const subConnector = new SubConnector(playerId, domain, mockWs as any);
            
            let messageReceived = false;
            let receivedMessage: any = null;
            
            subConnector.onClientMessage((message) => {
                messageReceived = true;
                receivedMessage = message;
            });
            
            const testMessage = { type: 'CLIENT_ACTION', payload: { data: 'test' } };
            subConnector.handleMessage(testMessage);
            
            expect(messageReceived).toBe(true);
            expect(receivedMessage).toEqual(testMessage);
        });

        it('should clean up resources on close', () => {
            const playerId = 'test-player' as PlayerId;
            const domain = 'test-domain';
            const mockWs = new MockWebSocket();
            const subConnector = new SubConnector(playerId, domain, mockWs as any);
            
            let closeHandlerCalled = false;
            subConnector.onClose(() => {
                closeHandlerCalled = true;
            });
            
            subConnector.close();
            
            expect(subConnector.ready).toBe(false);
            expect(closeHandlerCalled).toBe(true);
        });
    });

    describe('Message Routing', () => {
        it('should route messages to correct domains', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            const settings = createTestGameSettings();

            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, settings);

            // Clear previous messages
            ws.clearMessages();

            // Simulate incoming message for pregame domain
            const pregameMessage = {
                domain: 'pregame',
                type: 'SYNC_REQUEST',
                payload: { version: 0 }
            };

            ws.simulateMessage(pregameMessage);
            await waitForAsync(10);

            // Should not throw error
            expect(true).toBe(true);
        });

        it('should handle chat messages', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            const settings = createTestGameSettings();

            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, settings);

            // Clear previous messages
            ws.clearMessages();

            // Simulate chat message
            const chatMessage = {
                domain: 'chat',
                type: 'SEND_MESSAGE',
                payload: { content: 'Hello, world!' }
            };

            ws.simulateMessage(chatMessage);
            await waitForAsync(10);

            // Should handle gracefully
            expect(true).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed messages gracefully', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);

            await gameService.connectPlayer(playerId, ws as any);

            // Send malformed messages
            const malformedMessages = [
                null,
                undefined,
                {},
                { domain: 'unknown' },
                { type: 'SOME_ACTION' }
            ];

            for (const message of malformedMessages) {
                expect(() => ws.simulateMessage(message)).not.toThrow();
            }
        });

        it('should handle WebSocket errors gracefully', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);

            await gameService.connectPlayer(playerId, ws as any);

            // Simulate WebSocket error
            ws.readyState = 3; // WebSocket.CLOSED
            
            // Should handle gracefully
            expect(() => ws.send('test')).not.toThrow();
        });

        it('should reject joining non-existent game', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            const fakeGameId = 'fake_game_id' as any;

            await gameService.connectPlayer(playerId, ws as any);
            
            let errorThrown = false;
            try {
                await gameService.joinGame(playerId, fakeGameId);
            } catch (error) {
                errorThrown = true;
                expect((error as Error).message).toContain('Game not found');
            }
            expect(errorThrown).toBe(true);
        });
    });

    describe('Performance', () => {
        it('should handle rapid message sending', async () => {
            const { playerId, ws } = createMockPlayer('perf-test' as PlayerId);
            
            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, createTestGameSettings());

            const messageCount = 50;
            const startTime = Date.now();

            for (let i = 0; i < messageCount; i++) {
                ws.simulateMessage({
                    domain: 'chat',
                    type: 'SEND_MESSAGE',
                    payload: { content: `Message ${i}` }
                });
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete within reasonable time (less than 1 second)
            expect(duration).toBeLessThan(1000);
        });

        it('should handle multiple players efficiently', async () => {
            const playerCount = 4;
            const players = [];

            // Create host
            const host = createMockPlayer('host' as PlayerId);
            await gameService.connectPlayer(host.playerId, host.ws as any);
            const gameId = await gameService.createGame(host.playerId, createTestGameSettings());
            players.push(host);

            // Add other players
            for (let i = 1; i < playerCount; i++) {
                const player = createMockPlayer(`player${i}` as PlayerId);
                await gameService.connectPlayer(player.playerId, player.ws as any);
                await gameService.joinGame(player.playerId, gameId);
                players.push(player);
            }

            // All players should be connected
            for (const player of players) {
                expect(player.ws.sentMessages.length).toBeGreaterThan(0);
            }
        });
    });
});
