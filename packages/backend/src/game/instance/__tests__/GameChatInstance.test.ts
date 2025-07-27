import { describe, it, expect, beforeEach } from 'bun:test';
import { GameChatInstance, GameChatConnector } from '../GameChatInstance';
import { ChatMessage, ChatClientToServer, ChatServerToClient } from '@generale/types/src/game/chat';
import { PlayerId } from '@generale/types/src/game/core-type';

function createMockConnector() {
  let onMsg: ((msg: ChatClientToServer) => void) | undefined;
  const sent: ChatServerToClient[] = [];
  return {
    onMessage(cb: (msg: ChatClientToServer) => void) { onMsg = cb; },
    send(msg: ChatServerToClient) { sent.push(msg); },
    close() { /* noop */ },
    simulateClient(msg: ChatClientToServer) { onMsg?.(msg); },
    sent,
  } as GameChatConnector & { sent: ChatServerToClient[], simulateClient: (msg: ChatClientToServer) => void };
}

describe('GameChatInstance', () => {
  let chat: GameChatInstance;
  let c1: ReturnType<typeof createMockConnector>;
  let c2: ReturnType<typeof createMockConnector>;
  const pid1: PlayerId = 'p1';
  const pid2: PlayerId = 'p2';

  beforeEach(() => {
    chat = new GameChatInstance(10);
    c1 = createMockConnector();
    c2 = createMockConnector();
    chat.addPlayer(pid1, 'Alice', c1);
    chat.addPlayer(pid2, 'Bob', c2);

  });

  it('should broadcast user message', () => {
    c1.simulateClient({ type: 'send_message', content: 'hello' });
    // 两人都收到 new_message
    expect(c1.sent.some(e => e.type === 'new_message' && (e as any).message.content === 'hello')).toBe(true);
    expect(c2.sent.some(e => e.type === 'new_message' && (e as any).message.content === 'hello')).toBe(true);
  });

  it('should reject empty message', () => {
    c1.simulateClient({ type: 'send_message', content: '   ' });
    expect(c1.sent.find(e => e.type === 'send_result' && (e as any).status === 'failed')).toBeTruthy();
  });

  it('should send recent messages', () => {
    c1.simulateClient({ type: 'send_message', content: 'A' });
    c1.simulateClient({ type: 'send_message', content: 'B' });
    c2.sent.length = 0;
    c2.simulateClient({ type: 'fetch_recent', limit: 1 });
    expect(c2.sent.find(e => e.type === 'messages_batch' && (e as any).messages.length === 1)).toBeTruthy();
  });

  it('should send history by beforeId', () => {
    c1.simulateClient({ type: 'send_message', content: 'A' });
    c1.simulateClient({ type: 'send_message', content: 'B' });
    const allMsgs = c1.sent.filter(e => e.type === 'new_message') as any[];
    const beforeId = allMsgs[1].message.id;
    c2.sent.length = 0;
    c2.simulateClient({ type: 'fetch_history', beforeId, limit: 1 });
    expect(c2.sent.find(e => e.type === 'messages_batch' && (e as any).messages.length === 1)).toBeTruthy();
  });

  it('should send system message when player joins/leaves', () => {
    // 系统消息在 addPlayer 时已发
    expect(c1.sent.some(e => e.type === 'new_message' && (e as any).message.type === 'system')).toBe(true);
    chat.removePlayer(pid2);
    expect(c1.sent.some(e => e.type === 'new_message' && (e as any).message.content.includes('离开'))).toBe(true);
  });
});
