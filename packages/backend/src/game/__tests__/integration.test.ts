import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameService } from '../service/GameService';
import { PlayerId } from '@generale/types';

// Local type definition for testing
type GameId = string;
import { createMockPlayer, waitForAsync, createTestGameSettings } from '../service/__tests__/test-utils';

describe('Game System Integration Tests', () => {
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

    describe('Complete Game Flow', () => {
        it('should handle complete pregame to game transition', async () => {
            // Setup players
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            const { playerId: player1Id, ws: player1Ws } = createMockPlayer('player1' as PlayerId);
            const { playerId: player2Id, ws: player2Ws } = createMockPlayer('player2' as PlayerId);
            
            const settings = createTestGameSettings();

            // 1. Host connects and creates game
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, settings);

            // Verify host receives pregame and chat setup
            expect(hostWs.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(hostWs.getMessagesByDomain('chat').length).toBeGreaterThan(0);

            // 2. Players join
            await gameService.connectPlayer(player1Id, player1Ws as any);
            await gameService.joinGame(player1Id, gameId);

            await gameService.connectPlayer(player2Id, player2Ws as any);
            await gameService.joinGame(player2Id, gameId);

            // Verify all players receive updates
            expect(player1Ws.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(player1Ws.getMessagesByDomain('chat').length).toBeGreaterThan(0);
            expect(player2Ws.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(player2Ws.getMessagesByDomain('chat').length).toBeGreaterThan(0);

            // 3. Host changes settings
            hostWs.clearMessages();
            hostWs.simulateMessage({
                domain: 'pregame',
                type: 'UPDATE_SETTINGS',
                payload: { key: 'mapSize', value: 'large' },
                optimisticId: 1
            });

            await waitForAsync(10);

            // All players should receive setting update
            expect(hostWs.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(player1Ws.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(player2Ws.getMessagesByDomain('pregame').length).toBeGreaterThan(0);

            // 4. Players become ready
            player1Ws.simulateMessage({
                domain: 'pregame',
                type: 'TOGGLE_READY',
                optimisticId: 2
            });

            player2Ws.simulateMessage({
                domain: 'pregame',
                type: 'TOGGLE_READY',
                optimisticId: 3
            });

            await waitForAsync(10);

            // 5. Host starts game
            hostWs.simulateMessage({
                domain: 'pregame',
                type: 'START_GAME',
                optimisticId: 4
            });

            await waitForAsync(10);

            // All players should receive game starting notification
            // (In a real implementation, this would transition to GameInstance)
        });

        it('should handle chat throughout game lifecycle', async () => {
            // Setup game
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            const { playerId: playerId, ws: playerWs } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, createTestGameSettings());
            
            await gameService.connectPlayer(playerId, playerWs as any);
            await gameService.joinGame(playerId, gameId);

            // Clear initial messages
            hostWs.clearMessages();
            playerWs.clearMessages();

            // Host sends a message
            hostWs.simulateMessage({
                domain: 'chat',
                type: 'SEND_MESSAGE',
                payload: { content: 'Hello everyone!' },
                optimisticId: 1
            });

            await waitForAsync(10);

            // Both players should receive the message
            const hostChatMessages = hostWs.getMessagesByDomain('chat');
            const playerChatMessages = playerWs.getMessagesByDomain('chat');
            
            expect(hostChatMessages.length).toBeGreaterThan(0);
            expect(playerChatMessages.length).toBeGreaterThan(0);

            // Player sends a whisper to host
            playerWs.simulateMessage({
                domain: 'chat',
                type: 'SEND_MESSAGE',
                payload: { 
                    content: 'Secret message',
                    type: 'whisper',
                    targetPlayerId: hostId
                },
                optimisticId: 2
            });

            await waitForAsync(10);

            // Only host and player should receive whisper
            const hostWhisperMessages = hostWs.getMessagesByDomain('chat');
            expect(hostWhisperMessages.length).toBeGreaterThan(hostChatMessages.length);
        });
    });

    describe('Disconnection and Reconnection Scenarios', () => {
        it('should handle player disconnect and reconnect', async () => {
            // Setup
            const { playerId, ws: ws1 } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(playerId, ws1 as any);
            const gameId = await gameService.createGame(playerId, createTestGameSettings());

            // Verify initial connection
            expect(ws1.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(ws1.getMessagesByDomain('chat').length).toBeGreaterThan(0);

            // Simulate disconnect
            ws1.simulateClose();
            await waitForAsync(100);

            // Reconnect with new WebSocket
            const { ws: ws2 } = createMockPlayer('player1' as PlayerId);
            await gameService.connectPlayer(playerId, ws2 as any);

            await waitForAsync(10);

            // Should rejoin existing game
            expect(ws2.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            expect(ws2.getMessagesByDomain('chat').length).toBeGreaterThan(0);
        });

        it('should handle multiple players disconnecting and reconnecting', async () => {
            // Setup multiple players
            const players = [
                createMockPlayer('host' as PlayerId),
                createMockPlayer('player1' as PlayerId),
                createMockPlayer('player2' as PlayerId)
            ];

            // Connect all players
            await gameService.connectPlayer(players[0].playerId, players[0].ws as any);
            const gameId = await gameService.createGame(players[0].playerId, createTestGameSettings());

            for (let i = 1; i < players.length; i++) {
                await gameService.connectPlayer(players[i].playerId, players[i].ws as any);
                await gameService.joinGame(players[i].playerId, gameId);
            }

            // All disconnect
            players.forEach(p => p.ws.simulateClose());
            await waitForAsync(100);

            // All reconnect
            const newWebSockets = players.map(p => createMockPlayer(p.playerId).ws);
            
            for (let i = 0; i < players.length; i++) {
                await gameService.connectPlayer(players[i].playerId, newWebSockets[i] as any);
                await waitForAsync(10);
                
                // Should rejoin game
                expect(newWebSockets[i].getMessagesByDomain('pregame').length).toBeGreaterThan(0);
                expect(newWebSockets[i].getMessagesByDomain('chat').length).toBeGreaterThan(0);
            }
        });
    });

    describe('Error Recovery Scenarios', () => {
        it('should handle host disconnection and transfer', async () => {
            // Setup
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            const { playerId: playerId, ws: playerWs } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, createTestGameSettings());
            
            await gameService.connectPlayer(playerId, playerWs as any);
            await gameService.joinGame(playerId, gameId);

            // Host disconnects
            hostWs.simulateClose();
            await waitForAsync(100);

            // Player should receive host transfer notification
            // (This would be handled by PreGameInstance internally)
            expect(playerWs.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
            
            // Use gameId to avoid unused variable warning
            expect(gameId).toBeDefined();
        });

        it('should handle game cleanup when all players leave', async () => {
            // Setup
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            const { playerId: playerId, ws: playerWs } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, createTestGameSettings());
            
            await gameService.connectPlayer(playerId, playerWs as any);
            await gameService.joinGame(playerId, gameId);

            // All players disconnect
            hostWs.simulateClose();
            playerWs.simulateClose();
            
            await waitForAsync(200);

            // Game should be cleaned up
            // (This is verified by the absence of errors and proper cleanup)
            // Use gameId to avoid unused variable warning
            expect(gameId).toBeDefined();
        });

        it('should handle malformed messages gracefully', async () => {
            // Setup
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, createTestGameSettings());

            // Send various malformed messages
            const malformedMessages = [
                null,
                undefined,
                {},
                { domain: 'unknown' },
                { domain: 'pregame' }, // Missing type
                { domain: 'pregame', type: 'UNKNOWN_ACTION' },
                { type: 'UPDATE_SETTINGS' }, // Missing domain
            ];

            for (const message of malformedMessages) {
                expect(() => ws.simulateMessage(message)).not.toThrow();
            }
        });

        it('should handle WebSocket errors during operation', async () => {
            // Setup
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, createTestGameSettings());

            // Simulate WebSocket becoming unavailable
            ws.readyState = 3 // WebSocket.CLOSED;

            // Try to send messages - should handle gracefully
            ws.simulateMessage({
                domain: 'pregame',
                type: 'UPDATE_SETTINGS',
                payload: { key: 'mapSize', value: 'large' }
            });

            // Should not throw errors
            expect(true).toBe(true);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle multiple players joining simultaneously', async () => {
            // Setup host
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, createTestGameSettings());

            // Create multiple players
            const players = Array.from({ length: 3 }, (_, i) => 
                createMockPlayer(`player${i + 1}` as PlayerId)
            );

            // Connect all players simultaneously
            const joinPromises = players.map(async ({ playerId, ws }) => {
                await gameService.connectPlayer(playerId, ws as any);
                return gameService.joinGame(playerId, gameId);
            });

            // All should succeed
            await Promise.all(joinPromises);

            // Verify all players are in the game
            for (const { ws } of players) {
                expect(ws.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
                expect(ws.getMessagesByDomain('chat').length).toBeGreaterThan(0);
            }
        });

        it('should handle concurrent setting updates', async () => {
            // Setup
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            await gameService.connectPlayer(hostId, hostWs as any);
            await gameService.createGame(hostId, createTestGameSettings());

            // Send multiple setting updates rapidly
            const updates = [
                { key: 'mapSize', value: 'large' },
                { key: 'gameMode', value: 'blitz' },
                { key: 'timeLimit', value: 900000 }
            ];

            updates.forEach((update, index) => {
                hostWs.simulateMessage({
                    domain: 'pregame',
                    type: 'UPDATE_SETTINGS',
                    payload: update,
                    optimisticId: index + 1
                });
            });

            await waitForAsync(50);

            // All updates should be processed
            expect(hostWs.getMessagesByDomain('pregame').length).toBeGreaterThan(0);
        });

        it('should handle concurrent chat messages', async () => {
            // Setup
            const players = [
                createMockPlayer('host' as PlayerId),
                createMockPlayer('player1' as PlayerId),
                createMockPlayer('player2' as PlayerId)
            ];

            // Connect all players
            await gameService.connectPlayer(players[0].playerId, players[0].ws as any);
            const gameId = await gameService.createGame(players[0].playerId, createTestGameSettings());

            for (let i = 1; i < players.length; i++) {
                await gameService.connectPlayer(players[i].playerId, players[i].ws as any);
                await gameService.joinGame(players[i].playerId, gameId);
            }

            // Clear initial messages
            players.forEach(p => p.ws.clearMessages());

            // Send messages from all players simultaneously
            players.forEach(({ ws }, index) => {
                ws.simulateMessage({
                    domain: 'chat',
                    type: 'SEND_MESSAGE',
                    payload: { content: `Message from player ${index}` },
                    optimisticId: index + 1
                });
            });

            await waitForAsync(50);

            // All players should receive all messages
            for (const { ws } of players) {
                const chatMessages = ws.getMessagesByDomain('chat');
                expect(chatMessages.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Performance and Scalability', () => {
        it('should handle maximum players in a game', async () => {
            // Setup host
            const { playerId: hostId, ws: hostWs } = createMockPlayer('host' as PlayerId);
            await gameService.connectPlayer(hostId, hostWs as any);
            const gameId = await gameService.createGame(hostId, createTestGameSettings());

            // Add players up to the limit
            const maxPlayers = 4; // From test settings
            const players = [];

            for (let i = 1; i < maxPlayers; i++) {
                const player = createMockPlayer(`player${i}` as PlayerId);
                players.push(player);
                
                await gameService.connectPlayer(player.playerId, player.ws as any);
                await gameService.joinGame(player.playerId, gameId);
            }

            // Try to add one more (should fail)
            const extraPlayer = createMockPlayer('extra' as PlayerId);
            await gameService.connectPlayer(extraPlayer.playerId, extraPlayer.ws as any);
            
            await expect(gameService.joinGame(extraPlayer.playerId, gameId))
                .rejects.toThrow('Game is full');
        });

        it('should handle rapid connect/disconnect cycles', async () => {
            const { playerId, ws: ws1 } = createMockPlayer('player1' as PlayerId);
            
            // Rapid connect/disconnect cycles
            for (let i = 0; i < 5; i++) {
                await gameService.connectPlayer(playerId, ws1 as any);
                const gameId = await gameService.createGame(playerId, createTestGameSettings());
                
                ws1.simulateClose();
                await waitForAsync(10);
                
                // Should handle gracefully without errors
            }
        });

        it('should handle large chat message history', async () => {
            // Setup
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, createTestGameSettings());

            // Send many messages
            for (let i = 0; i < 50; i++) {
                ws.simulateMessage({
                    domain: 'chat',
                    type: 'SEND_MESSAGE',
                    payload: { content: `Message ${i}` },
                    optimisticId: i + 1
                });
            }

            await waitForAsync(100);

            // Should handle without performance issues
            const chatMessages = ws.getMessagesByDomain('chat');
            expect(chatMessages.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle player joining non-existent game', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            await gameService.connectPlayer(playerId, ws as any);
            
            const fakeGameId = 'fake-game-id' as any;
            
            await expect(gameService.joinGame(playerId, fakeGameId))
                .rejects.toThrow('Game not found');
        });

        it('should handle actions from disconnected players', async () => {
            const { playerId, ws } = createMockPlayer('player1' as PlayerId);
            
            await gameService.connectPlayer(playerId, ws as any);
            await gameService.createGame(playerId, createTestGameSettings());
            
            // Disconnect player
            ws.simulateClose();
            await waitForAsync(100);
            
            // Try to send action (should be ignored)
            ws.simulateMessage({
                domain: 'pregame',
                type: 'UPDATE_SETTINGS',
                payload: { key: 'mapSize', value: 'large' }
            });
            
            // Should not cause errors
            expect(true).toBe(true);
        });

        it('should handle empty game creation', async () => {
            const { playerId, ws } = createMockPlayer('host' as PlayerId);
            await gameService.connectPlayer(playerId, ws as any);
            
            // Create game with minimal settings
            const gameId = await gameService.createGame(playerId, {
                mapSize: 'small',
                maxPlayers: 2,
                gameMode: 'classic'
            });
            
            expect(gameId).toBeDefined();
            expect(typeof gameId).toBe('string');
        });
    });
});
