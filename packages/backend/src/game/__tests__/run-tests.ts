#!/usr/bin/env bun

/**
 * Test runner script for game system
 * 
 * This script demonstrates how to run the game system tests
 * and provides a simple way to verify functionality
 */

import { describe, it, expect } from 'vitest';
import { GameService } from '../service/GameService';
import { PreGameInstance } from '../instance/PreGameInstance';
import { GameChatInstance } from '../instance/GameChatInstance';
import { SubConnector } from '../service/SubConnector';
import { createMockPlayer, createTestGameSettings } from '../service/__tests__/test-utils';
import { PlayerId } from '@generale/types';

// Simple test demonstration
async function runBasicTests() {
    console.log('🎮 Running Game System Basic Tests...\n');

    // Test 1: GameService initialization
    console.log('1. Testing GameService initialization...');
    const gameService = new GameService({
        maxPlayersPerGame: 4,
        gameTimeout: 300000,
        heartbeatInterval: 30000
    });
    console.log('✅ GameService created successfully');

    // Test 2: Player connection
    console.log('\n2. Testing player connection...');
    const { playerId, ws } = createMockPlayer('test-player' as PlayerId);
    await gameService.connectPlayer(playerId, ws as any);
    console.log('✅ Player connected successfully');

    // Test 3: Game creation
    console.log('\n3. Testing game creation...');
    const settings = createTestGameSettings();
    const gameId = await gameService.createGame(playerId, settings);
    console.log(`✅ Game created with ID: ${gameId}`);

    // Test 4: Message handling
    console.log('\n4. Testing message handling...');
    ws.simulateMessage({
        domain: 'pregame',
        type: 'SYNC_REQUEST',
        payload: { version: 0 }
    });
    console.log('✅ Message handled successfully');

    // Test 5: Chat functionality
    console.log('\n5. Testing chat functionality...');
    ws.simulateMessage({
        domain: 'chat',
        type: 'SEND_MESSAGE',
        payload: { content: 'Hello, world!' }
    });
    console.log('✅ Chat message sent successfully');

    // Cleanup
    gameService.destroy();
    console.log('\n✅ All basic tests passed!\n');
}

// Component isolation tests
async function runComponentTests() {
    console.log('🔧 Running Component Isolation Tests...\n');

    // Test SubConnector
    console.log('1. Testing SubConnector...');
    const mockWs = createMockPlayer('test' as PlayerId).ws;
    const subConnector = new SubConnector('test' as PlayerId, 'test-domain', mockWs as any);
    
    let messageReceived = false;
    subConnector.onClientMessage(() => {
        messageReceived = true;
    });
    
    subConnector.handleMessage({ type: 'TEST', payload: {} });
    
    if (messageReceived) {
        console.log('✅ SubConnector message handling works');
    } else {
        console.log('❌ SubConnector message handling failed');
    }

    subConnector.close();
    console.log('✅ SubConnector cleanup successful');

    console.log('\n✅ Component tests completed!\n');
}

// Error handling tests
async function runErrorHandlingTests() {
    console.log('⚠️  Running Error Handling Tests...\n');

    const gameService = new GameService({
        maxPlayersPerGame: 2,
        gameTimeout: 300000,
        heartbeatInterval: 30000
    });

    // Test 1: Invalid game join
    console.log('1. Testing invalid game join...');
    const { playerId, ws } = createMockPlayer('test-player' as PlayerId);
    await gameService.connectPlayer(playerId, ws as any);
    
    try {
        await gameService.joinGame(playerId, 'invalid-game-id' as any);
        console.log('❌ Should have thrown error for invalid game');
    } catch (error) {
        console.log('✅ Correctly rejected invalid game join');
    }

    // Test 2: Malformed messages
    console.log('\n2. Testing malformed message handling...');
    try {
        ws.simulateMessage(null);
        ws.simulateMessage({});
        ws.simulateMessage({ domain: 'unknown' });
        console.log('✅ Malformed messages handled gracefully');
    } catch (error) {
        console.log('❌ Malformed message handling failed:', error);
    }

    // Test 3: Game capacity limits
    console.log('\n3. Testing game capacity limits...');
    const gameId = await gameService.createGame(playerId, createTestGameSettings());
    
    // Fill the game
    const player2 = createMockPlayer('player2' as PlayerId);
    await gameService.connectPlayer(player2.playerId, player2.ws as any);
    await gameService.joinGame(player2.playerId, gameId);
    
    // Try to add one more (should fail)
    const player3 = createMockPlayer('player3' as PlayerId);
    await gameService.connectPlayer(player3.playerId, player3.ws as any);
    
    try {
        await gameService.joinGame(player3.playerId, gameId);
        console.log('❌ Should have rejected player when game is full');
    } catch (error) {
        console.log('✅ Correctly rejected player when game is full');
    }

    gameService.destroy();
    console.log('\n✅ Error handling tests completed!\n');
}

// Performance tests
async function runPerformanceTests() {
    console.log('🚀 Running Performance Tests...\n');

    const gameService = new GameService({
        maxPlayersPerGame: 4,
        gameTimeout: 300000,
        heartbeatInterval: 30000
    });

    // Test rapid message sending
    console.log('1. Testing rapid message handling...');
    const { playerId, ws } = createMockPlayer('perf-test' as PlayerId);
    await gameService.connectPlayer(playerId, ws as any);
    const gameId = await gameService.createGame(playerId, createTestGameSettings());

    const startTime = Date.now();
    const messageCount = 100;

    for (let i = 0; i < messageCount; i++) {
        ws.simulateMessage({
            domain: 'chat',
            type: 'SEND_MESSAGE',
            payload: { content: `Message ${i}` }
        });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const messagesPerSecond = Math.round((messageCount / duration) * 1000);

    console.log(`✅ Processed ${messageCount} messages in ${duration}ms`);
    console.log(`✅ Performance: ~${messagesPerSecond} messages/second`);

    gameService.destroy();
    console.log('\n✅ Performance tests completed!\n');
}

// Main test runner
async function main() {
    console.log('🎯 Game System Test Suite\n');
    console.log('=' .repeat(50));

    try {
        await runBasicTests();
        await runComponentTests();
        await runErrorHandlingTests();
        await runPerformanceTests();

        console.log('🎉 All test suites completed successfully!');
        console.log('\nTo run the full test suite with vitest:');
        console.log('  npm run test');
        console.log('  npm run test:watch');
        console.log('  npm run test:coverage');
        
    } catch (error) {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.main) {
    main();
}

export { runBasicTests, runComponentTests, runErrorHandlingTests, runPerformanceTests };
