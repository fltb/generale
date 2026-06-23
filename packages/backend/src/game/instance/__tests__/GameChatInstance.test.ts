import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameChatInstance } from '../GameChatInstance';
import type { GameChatConnector } from '../GameChatInstance';

function createMockConnector() {
  return {
    onClientMessage: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as GameChatConnector;
}

describe('GameChatInstance', () => {
  let chat: GameChatInstance;
  const player1 = 'p1';
  const player2 = 'p2';
  let connector1: GameChatConnector;
  let connector2: GameChatConnector;

  beforeEach(() => {
    chat = new GameChatInstance(3); // maxMessages=3 for easy overflow test
    connector1 = createMockConnector();
    connector2 = createMockConnector();
  });

  it('初始化应添加系统消息', () => {
    expect(chat["messages"][0].content).toMatch(/欢迎/);
  });

  it('玩家加入应注册 connector 并能收到历史消息', () => {
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    expect(chat["connectors"].get(player1)).toBe(connector1);
    // 加入后应收到历史消息（type: messages_batch）
    expect(connector1.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'messages_batch' }));
    // 还应收到系统欢迎消息和加入消息
    expect(connector1.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'new_message' }));
  });

  it('玩家发送消息应广播给所有玩家并入队', () => {
    let handler1: any;
    (connector1.onClientMessage as any).mockImplementation((cb: (msg: any) => void) => { handler1 = cb; });
    (connector1.send as any).mockClear();
    (connector2.send as any).mockClear();
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    chat.addPlayer({ id: player2, name: 'Bob' }, connector2);
    // 玩家1发送消息
    handler1 && handler1({ type: 'send_message', content: 'hello' });
    // 输出调试信息
    const sendCalls1 = (connector1.send as any).mock.calls;
    const sendCalls2 = (connector2.send as any).mock.calls;
    console.log('sendCalls1 after hello:', JSON.stringify(sendCalls1, null, 2));
    console.log('sendCalls2 after hello:', JSON.stringify(sendCalls2, null, 2));
    expect(sendCalls1.some((args: any[]) => args[0].type === 'new_message' && args[0].message.content === 'hello')).toBe(true);
    expect(sendCalls2.some((args: any[]) => args[0].type === 'new_message' && args[0].message.content === 'hello')).toBe(true);
    // 消息入队
    expect(chat["messages"].some(m => m.content === 'hello')).toBe(true);
  });

  it('消息队列超限应丢弃最早的', () => {
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    let handler: any;
    (connector1.onClientMessage as any).mockImplementation((cb: (msg: any) => void) => { handler = cb; });
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1); // 触发 handler 注册
    handler && handler({ type: 'send_message', content: '1' });
    handler && handler({ type: 'send_message', content: '2' });
    handler && handler({ type: 'send_message', content: '3' });
    handler && handler({ type: 'send_message', content: '4' });
    // 只检查队列中非系统消息（playerId !== 'system'）
    const userMsgs = chat["messages"].filter((m: any) => m.playerId !== 'system').map((m: any) => m.content);
    expect(userMsgs).toEqual(['2', '3', '4']);
  });

  it('玩家离开后不会再收到消息', () => {
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    chat.addPlayer({ id: player2, name: 'Bob' }, connector2);
    chat.removePlayer(player2);
    let handler1: any;
    (connector1.onClientMessage as any).mockImplementation((cb: any) => { handler1 = cb; });
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    handler1!({ type: 'send_message', content: 'bye' });
    expect(connector2.send).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'bye' }));
  });

  it('未加入玩家发消息无效', () => {
    // 不注册 onMessage
    // 直接调用内部方法模拟
    expect(() => (chat as any).handleMessage('ghost', { type: 'send_message', content: 'xxx' })).not.toThrow();
  });

  it('多次加入/移除同一玩家无副作用', () => {
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    chat.addPlayer({ id: player1, name: 'Alice' }, connector1);
    chat.removePlayer(player1);
    chat.removePlayer(player1);
    expect(chat["connectors"].get(player1)).toBeUndefined();
  });
});
