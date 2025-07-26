import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SubConnector } from '../SubConnector';
import { PlayerId } from '@generale/types';
import { MockWebSocket } from './test-utils';

describe('SubConnector', () => {
    let mockWs: MockWebSocket;
    let subConnector: SubConnector;
    let playerId: PlayerId;
    let domain: string;

    beforeEach(() => {
        playerId = 'test-player' as PlayerId;
        domain = 'test-domain';
        mockWs = new MockWebSocket();
        subConnector = new SubConnector(playerId, domain, mockWs as any);
    });

    describe('Initialization', () => {
        it('should initialize with correct properties', () => {
            expect(subConnector.ready).toBe(true);
            
            const info = subConnector.getInfo();
            expect(info.playerId).toBe(playerId);
            expect(info.domain).toBe(domain);
            expect(info.ready).toBe(true);
        });

        it('should be ready when WebSocket is open', () => {
            mockWs.readyState = 1 // WebSocket.OPEN;
            expect(subConnector.ready).toBe(true);
        });

        it('should not be ready when WebSocket is closed', () => {
            mockWs.readyState = 3 // WebSocket.CLOSED;
            expect(subConnector.ready).toBe(false);
        });
    });

    describe('Message Sending', () => {
        it('should send messages with correct domain', () => {
            const testEvent = { type: 'TEST_EVENT', payload: { data: 'test' } };
            
            subConnector.send(testEvent);
            
            expect(mockWs.sentMessages).toHaveLength(1);
            const sentMessage = mockWs.sentMessages[0];
            expect(sentMessage.domain).toBe(domain);
            expect(sentMessage.type).toBe('TEST_EVENT');
            expect(sentMessage.payload).toEqual({ data: 'test' });
        });

        it('should not send when not ready', () => {
            mockWs.readyState = 3 // WebSocket.CLOSED;
            const testEvent = { type: 'TEST_EVENT', payload: {} };
            
            subConnector.send(testEvent);
            
            expect(mockWs.sentMessages).toHaveLength(0);
        });

        it('should handle send errors gracefully', () => {
            const originalSend = mockWs.send;
            mockWs.send = (() => {}).mockImplementation(() => {
                throw new Error('Send failed');
            });

            const testEvent = { type: 'TEST_EVENT', payload: {} };
            
            expect(() => subConnector.send(testEvent)).not.toThrow();
            
            mockWs.send = originalSend;
        });
    });

    describe('Event Handlers', () => {
        it('should register and call client message handlers', () => {
            const handler = (() => {});
            subConnector.onClientMessage(handler);
            
            const testMessage = { type: 'CLIENT_ACTION', payload: { data: 'test' } };
            subConnector.handleMessage(testMessage);
            
            expect(handler).toHaveBeenCalledWith(testMessage);
        });

        it('should register and call open handlers immediately if ready', () => {
            const handler = (() => {});
            
            subConnector.onOpen(handler);
            
            expect(handler).toHaveBeenCalled();
        });

        it('should register close handlers', () => {
            const handler = (() => {});
            subConnector.onClose(handler);
            
            subConnector.close(1000, 'Test close');
            
            expect(handler).toHaveBeenCalledWith(1000, 'Test close');
        });

        it('should register disconnect handlers', () => {
            const handler = (() => {});
            const error = new Error('Test disconnect');
            
            subConnector.onDisconnect(handler);
            subConnector.handleDisconnect(error);
            
            expect(handler).toHaveBeenCalledWith(error);
        });

        it('should register reconnect handlers', () => {
            const handler = (() => {});
            
            subConnector.onReconnect(handler);
            subConnector.handleReconnect();
            
            expect(handler).toHaveBeenCalled();
        });
    });

    describe('Message Handling', () => {
        it('should handle incoming messages', () => {
            const handler = (() => {});
            subConnector.onClientMessage(handler);
            
            const message = { type: 'TEST_ACTION', payload: { value: 42 } };
            subConnector.handleMessage(message);
            
            expect(handler).toHaveBeenCalledWith(message);
        });

        it('should not handle messages when not ready', () => {
            const handler = (() => {});
            subConnector.onClientMessage(handler);
            
            subConnector.close();
            
            const message = { type: 'TEST_ACTION', payload: {} };
            subConnector.handleMessage(message);
            
            expect(handler).not.toHaveBeenCalled();
        });

        it('should handle message handler errors gracefully', () => {
            const errorHandler = (() => {}).mockImplementation(() => {
                throw new Error('Handler error');
            });
            
            subConnector.onClientMessage(errorHandler);
            
            const message = { type: 'TEST_ACTION', payload: {} };
            
            expect(() => subConnector.handleMessage(message)).not.toThrow();
        });
    });

    describe('Connection State Management', () => {
        it('should handle disconnect correctly', () => {
            const disconnectHandler = (() => {});
            subConnector.onDisconnect(disconnectHandler);
            
            const error = new Error('Connection lost');
            subConnector.handleDisconnect(error);
            
            expect(subConnector.ready).toBe(false);
            expect(disconnectHandler).toHaveBeenCalledWith(error);
        });

        it('should handle reconnect correctly', () => {
            const openHandler = (() => {});
            const reconnectHandler = (() => {});
            
            subConnector.onOpen(openHandler);
            subConnector.onReconnect(reconnectHandler);
            
            // Simulate disconnect first
            subConnector.handleDisconnect();
            expect(subConnector.ready).toBe(false);
            
            // Clear the initial open call
            openHandler.mockClear();
            
            // Simulate reconnect
            subConnector.handleReconnect();
            
            expect(subConnector.ready).toBe(true);
            expect(reconnectHandler).toHaveBeenCalled();
            expect(openHandler).toHaveBeenCalled();
        });

        it('should not trigger disconnect handlers multiple times', () => {
            const disconnectHandler = (() => {});
            subConnector.onDisconnect(disconnectHandler);
            
            subConnector.handleDisconnect();
            subConnector.handleDisconnect(); // Second call should be ignored
            
            expect(disconnectHandler).toHaveBeenCalledTimes(1);
        });
    });

    describe('Resource Cleanup', () => {
        it('should clean up all handlers on close', () => {
            const messageHandler = (() => {});
            const openHandler = (() => {});
            const closeHandler = (() => {});
            const disconnectHandler = (() => {});
            const reconnectHandler = (() => {});
            
            subConnector.onClientMessage(messageHandler);
            subConnector.onOpen(openHandler);
            subConnector.onClose(closeHandler);
            subConnector.onDisconnect(disconnectHandler);
            subConnector.onReconnect(reconnectHandler);
            
            subConnector.close();
            
            expect(closeHandler).toHaveBeenCalled();
            expect(subConnector.ready).toBe(false);
            
            // After close, handlers should be cleared
            subConnector.handleMessage({ type: 'TEST' });
            subConnector.handleReconnect();
            
            expect(messageHandler).not.toHaveBeenCalled();
            expect(reconnectHandler).not.toHaveBeenCalled();
        });

        it('should handle close with default parameters', () => {
            const closeHandler = (() => {});
            subConnector.onClose(closeHandler);
            
            subConnector.close();
            
            expect(closeHandler).toHaveBeenCalledWith(1000, 'Normal closure');
        });

        it('should handle close handler errors gracefully', () => {
            const errorHandler = (() => {}).mockImplementation(() => {
                throw new Error('Close handler error');
            });
            
            subConnector.onClose(errorHandler);
            
            expect(() => subConnector.close()).not.toThrow();
        });
    });

    describe('Multiple Handlers', () => {
        it('should call multiple message handlers', () => {
            const handler1 = (() => {});
            const handler2 = (() => {});
            
            subConnector.onClientMessage(handler1);
            subConnector.onClientMessage(handler2);
            
            const message = { type: 'TEST_ACTION', payload: {} };
            subConnector.handleMessage(message);
            
            expect(handler1).toHaveBeenCalledWith(message);
            expect(handler2).toHaveBeenCalledWith(message);
        });

        it('should call multiple open handlers', () => {
            const handler1 = (() => {});
            const handler2 = (() => {});
            
            subConnector.onOpen(handler1);
            subConnector.onOpen(handler2);
            
            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });

        it('should continue calling other handlers if one fails', () => {
            const errorHandler = (() => {}).mockImplementation(() => {
                throw new Error('Handler error');
            });
            const goodHandler = (() => {});
            
            subConnector.onClientMessage(errorHandler);
            subConnector.onClientMessage(goodHandler);
            
            const message = { type: 'TEST_ACTION', payload: {} };
            subConnector.handleMessage(message);
            
            expect(errorHandler).toHaveBeenCalled();
            expect(goodHandler).toHaveBeenCalled();
        });
    });
});
