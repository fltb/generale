import { PlayerId } from '@generale/types';

/**
 * Mock WebSocket for testing
 */
export class MockWebSocket {
    public readyState: number = 1; // WebSocket.OPEN
    public sentMessages: any[] = [];
    public subscribers: string[] = [];
    private messageHandlers: ((message: any) => void)[] = [];
    private closeHandlers: (() => void)[] = [];
    private openHandlers: (() => void)[] = [];
    private errorHandlers: ((error: any) => void)[] = [];

    send(data: string): void {
        if (this.readyState !== 1) {
            throw new Error('WebSocket is not open');
        }
        try {
            const parsed = JSON.parse(data);
            this.sentMessages.push(parsed);
            // 模拟消息发送成功
            return;
        } catch (error) {
            // 如果不是 JSON，直接存储
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
        } else if (event === 'open') {
            this.openHandlers.push(handler);
        } else if (event === 'error') {
            this.errorHandlers.push(handler);
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

/**
 * Create a mock player with WebSocket
 */
export function createMockPlayer(playerId: PlayerId): { playerId: PlayerId; ws: MockWebSocket } {
    return {
        playerId,
        ws: new MockWebSocket()
    };
}

/**
 * Wait for async operations to complete
 */
export function waitForAsync(ms: number = 0): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract message payload from WebSocket message
 */
export function extractPayload(message: any): any {
    return message.payload || message;
}

/**
 * Create test game settings
 */
export function createTestGameSettings() {
    return {
        mapSize: 'medium' as const,
        maxPlayers: 4,
        gameMode: 'classic' as const,
        timeLimit: 1800000 // 30 minutes
    };
}
