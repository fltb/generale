import { describe, it, expect, beforeEach } from 'bun:test';
import { SubConnector } from '../SubConnector';
import { PlayerId } from '@generale/types';
import { MockWebSocket } from './test-utils';

describe('SubConnector', () => {
    let mockWs: MockWebSocket;
    let subConnector: SubConnector;
    const playerId = 'test-player' as PlayerId;
    const domain = 'test-domain';

    beforeEach(() => {
        mockWs = new MockWebSocket();
        subConnector = new SubConnector(playerId, domain, mockWs as any);
    });

    describe('Initialization', () => {
        it('should initialize with correct properties', () => {
            expect(subConnector.ready).toBe(true);
            
            const info = subConnector.getInfo();
            expect(info.playerId).toBe(playerId);
            expect(info.domain).toBe(domain);
        });

        it('should subscribe to correct topic', () => {
            expect(mockWs.subscribers).toContain(`player-${playerId}`);
        });
    });

    describe('Message Sending', () => {
        it('should send messages with correct domain', () => {
            const testEvent = {
                type: 'TEST_EVENT',
                payload: { data: 'test' }
            };

            subConnector.send(testEvent);

            expect(mockWs.sentMessages).toHaveLength(1);
            const sentMessage = mockWs.sentMessages[0];
            expect(sentMessage.domain).toBe(domain);
            expect(sentMessage.type).toBe('TEST_EVENT');
            expect(sentMessage.payload).toEqual({ data: 'test' });
        });

        it('should not send when not ready', () => {
            subConnector.close();
            
            const testEvent = {
                type: 'TEST_EVENT',
                payload: { data: 'test' }
            };

            subConnector.send(testEvent);
            expect(mockWs.sentMessages).toHaveLength(0);
        });
    });

    describe('Event Handling', () => {
        it('should handle client messages', () => {
            let messageReceived = false;
            let receivedMessage: any = null;

            subConnector.onClientMessage((message) => {
                messageReceived = true;
                receivedMessage = message;
            });

            const testMessage = {
                type: 'CLIENT_ACTION',
                payload: { data: 'test' }
            };

            subConnector.handleMessage(testMessage);

            expect(messageReceived).toBe(true);
            expect(receivedMessage).toEqual(testMessage);
        });

        it('should support multiple message handlers', () => {
            let handler1Called = false;
            let handler2Called = false;

            subConnector.onClientMessage(() => {
                handler1Called = true;
            });

            subConnector.onClientMessage(() => {
                handler2Called = true;
            });

            subConnector.handleMessage({ type: 'TEST', payload: {} });

            expect(handler1Called).toBe(true);
            expect(handler2Called).toBe(true);
        });

        it('should handle close events', () => {
            let closeHandlerCalled = false;

            subConnector.onClose(() => {
                closeHandlerCalled = true;
            });

            subConnector.close();

            expect(closeHandlerCalled).toBe(true);
            expect(subConnector.ready).toBe(false);
        });
    });

    describe('Connection State', () => {
        it('should track ready state correctly', () => {
            expect(subConnector.ready).toBe(true);

            subConnector.close();
            expect(subConnector.ready).toBe(false);
        });

        it('should handle WebSocket close', () => {
            let closeHandlerCalled = false;

            subConnector.onClose(() => {
                closeHandlerCalled = true;
            });

            mockWs.simulateClose();

            expect(closeHandlerCalled).toBe(true);
            expect(subConnector.ready).toBe(false);
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up resources on close', () => {
            let closeHandlerCalled = false;
            let messageHandlerCalled = false;

            subConnector.onClose(() => {
                closeHandlerCalled = true;
            });

            subConnector.onClientMessage(() => {
                messageHandlerCalled = true;
            });

            subConnector.close();

            // After close, message handlers should not be called
            subConnector.handleMessage({ type: 'TEST', payload: {} });

            expect(closeHandlerCalled).toBe(true);
            expect(messageHandlerCalled).toBe(false);
            expect(subConnector.ready).toBe(false);
        });

        it('should handle multiple close calls gracefully', () => {
            let closeCallCount = 0;

            subConnector.onClose(() => {
                closeCallCount++;
            });

            subConnector.close();
            subConnector.close();
            subConnector.close();

            expect(closeCallCount).toBe(1); // Should only be called once
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid messages gracefully', () => {
            let errorThrown = false;

            try {
                subConnector.handleMessage(null);
                subConnector.handleMessage(undefined);
                subConnector.handleMessage({});
            } catch (error) {
                errorThrown = true;
            }

            expect(errorThrown).toBe(false);
        });

        it('should handle WebSocket send errors gracefully', () => {
            // Simulate WebSocket error
            mockWs.readyState = 3; // CLOSED

            const testEvent = {
                type: 'TEST_EVENT',
                payload: { data: 'test' }
            };

            // Should not throw error, but also should not send
            expect(() => subConnector.send(testEvent)).not.toThrow();
            expect(mockWs.sentMessages).toHaveLength(0);
        });
    });
});
