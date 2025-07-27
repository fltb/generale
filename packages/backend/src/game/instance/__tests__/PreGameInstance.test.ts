import { describe, it, expect, beforeEach } from 'bun:test';
import { PreGameInstance } from '../PreGameInstance';
import {
  PreGameRoomState, PreGamePlayerReadyState,
  SyncedPreGameClientActionTypes, SyncedPreGameClientActions,
  SyncedPreGameServerEventType,
  PlayerId, PreGameMapType
} from '@generale/types';

// 简单 mock connector
class MockConnector {
  public sent: any[] = [];
  public listeners: Record<string, Function[]> = {};
  send(evt: any) { this.sent.push(evt); }
  onOpen(cb: () => void) { (this.listeners['open'] ||= []).push(cb); }
  onDisconnect(cb: () => void) { (this.listeners['disconnect'] ||= []).push(cb); }
  onReconnect(cb: () => void) { (this.listeners['reconnect'] ||= []).push(cb); }
  onClientMessage(cb: (evt: any) => void) { (this.listeners['msg'] ||= []).push(cb); }
  onClose(cb: () => void) { (this.listeners['close'] ||= []).push(cb); }
  simulateClientMessage(evt: any) { (this.listeners['msg']||[]).forEach(fn=>fn(evt)); }
  close() {/* mock 关闭，无需实现内容 */}
}

describe('PreGameInstance sync actions', () => {
  let instance: PreGameInstance;
  let connectors: Map<PlayerId, MockConnector>;
  const host: PlayerId = 'p1';
  const p2: PlayerId = 'p2';
  let baseState: PreGameRoomState;
  beforeEach(() => {
    connectors = new Map([
      [host, new MockConnector()],
      [p2, new MockConnector()],
    ]);
    baseState = {
      gameId: 'g1',
      hostId: host,
      players: [
        { id: host, name: 'H', teamId: 't1', isHost: true, ready: PreGamePlayerReadyState.NotReady },
        { id: p2, name: 'P2', teamId: 't2', isHost: false, ready: PreGamePlayerReadyState.NotReady },
      ],
      mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
      gameSetting: { speed: 1, tileGrowth: 1, tileConsume: 1 },
      teamCount: 2,
      playerLimit: 8,
      started: false,
    };
    instance = new PreGameInstance(baseState, connectors as any);
  });

  function clearAll() { connectors.forEach(c => c.sent = []); }
  function lastSync(conn: MockConnector) {
    return conn.sent.find(e => e.type === SyncedPreGameServerEventType.STATE_UPDATE);
  }

  const actions: Array<{
    desc: string,
    actor: PlayerId,
    action: SyncedPreGameClientActions,
    check: (state: PreGameRoomState) => void
  }> = [
    {
      desc: 'p2 ready',
      actor: p2,
      action: { type: SyncedPreGameClientActionTypes.READY, optimisticId: 1 },
      check: state => {
        expect(state.players.find(p => p.id === p2)?.ready).toBe(PreGamePlayerReadyState.Ready);
      }
    },
    {
      desc: 'p2 unready',
      actor: p2,
      action: { type: SyncedPreGameClientActionTypes.UNREADY, optimisticId: 2 },
      check: state => {
        expect(state.players.find(p => p.id === p2)?.ready).toBe(PreGamePlayerReadyState.NotReady);
      }
    },
    {
      desc: 'host change setting',
      actor: host,
      action: { type: SyncedPreGameClientActionTypes.CHANGE_SETTING, payload: { speed: 2 }, optimisticId: 3 },
      check: state => {
        expect(state.gameSetting.speed).toBe(2);
      }
    },
    {
      desc: 'host change map',
      actor: host,
      action: { type: SyncedPreGameClientActionTypes.CHANGE_MAP, payload: { type: PreGameMapType.Random, width: 20, height: 20, tileFrequency: {} }, optimisticId: 4 },
      check: state => {
        if (state.mapSetting.type === PreGameMapType.Random || state.mapSetting.type === PreGameMapType.Custom) {
          expect(state.mapSetting.width).toBe(20);
        }
      }
    },
    {
      desc: 'p2 change team',
      actor: p2,
      action: { type: SyncedPreGameClientActionTypes.CHANGE_TEAM, payload: { teamId: 't3' }, optimisticId: 5 },
      check: state => {
        expect(state.players.find(p => p.id === p2)?.teamId).toBe('t3');
      }
    },
    {
      desc: 'host transfer host',
      actor: host,
      action: { type: SyncedPreGameClientActionTypes.TRANSFER_HOST, payload: { newHostId: p2 }, optimisticId: 6 },
      check: state => {
        expect(state.hostId).toBe(p2);
        expect(state.players.find(p => p.id === p2)?.isHost).toBe(true);
      }
    },
    {
      desc: 'host kick p2',
      actor: host,
      action: { type: SyncedPreGameClientActionTypes.KICK_PLAYER, payload: { playerId: p2 }, optimisticId: 7 },
      check: state => {
        expect(state.players.find(p => p.id === p2)).toBeUndefined();
        // 检查 p2 收到 KICKED 事件且不再收到 sync
        const kickedEvt = connectors.get(p2)?.sent.find(e => e.type === 'kicked');
        expect(kickedEvt).toBeDefined();
        // 踢后不再收到 sync
        const afterKickSync = connectors.get(p2)?.sent.find(e => e.type === 'state_update');
        expect(afterKickSync).toBeUndefined();
      }
    },
    {
      desc: 'host disband room',
      actor: host,
      action: { type: SyncedPreGameClientActionTypes.DISBAND_ROOM, optimisticId: 8 },
      check: _state => {
        // 所有玩家都应收到 DISBANDED 事件
        for (const c of connectors.values()) {
          const disbandEvt = c.sent.find(e => e.type === 'disbanded');
          expect(disbandEvt).toBeDefined();
        }
      }
    },
  ];

  for (const { desc, actor, action, check } of actions) {
    it(`should sync after ${desc}`, () => {
      clearAll();
      // 模拟客户端事件
      const conn = connectors.get(actor)!;
      conn.simulateClientMessage(action);
      // 检查所有玩家都收到同步消息
      for (const [pid, c] of connectors) {
        if (instance.getState().players.some(p => p.id === pid)) {
          const syncEvt = lastSync(c);
          expect(syncEvt).toBeDefined();
          expect(syncEvt.payload).toBeDefined();
          expect(['snapshot', 'patch']).toContain(syncEvt.payload.type);
        }
      }
      check(instance.getState());
    });
  }
});