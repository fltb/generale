import { ElysiaWS } from 'elysia/ws';
import { PlayerId, ServerSyncConnector } from '@generale/types';

/**
 * SubConnector - 子连接器
 * 
 * 实现 ServerSyncConnector 接口，为各种游戏实例提供统一的消息收发能力
 * 每个 SubConnector 对应一个特定的 domain (如 'pregame', 'game', 'chat')
 */
export class SubConnector<CEvt = any, SEvt = any> implements ServerSyncConnector<CEvt, SEvt> {
    private playerId: PlayerId;
    private domain: string;
    private ws: ElysiaWS;
    private _ready: boolean = true;
    private messageHandlers: ((evt: CEvt) => void)[] = [];
    private openHandlers: (() => void)[] = [];
    private closeHandlers: ((code: number, reason: string) => void)[] = [];
    private disconnectHandlers: ((err?: Error) => void)[] = [];
    private reconnectHandlers: (() => void)[] = [];

    constructor(playerId: PlayerId, domain: string, ws: ElysiaWS) {
        this.playerId = playerId;
        this.domain = domain;
        this.ws = ws;
        
        // 订阅玩家主题
        this.ws.subscribe(`player-${playerId}`);
        
        // 监听 WebSocket 关闭事件
        this.ws.on('close', () => {
            this.handleClose();
        });
    }

    get ready(): boolean {
        return this._ready && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * 向客户端发送事件
     */
    send(evt: SEvt): void {
        if (!this.ready) {
            console.warn(`SubConnector[${this.domain}:${this.playerId}] - Cannot send, not ready`);
            return;
        }

        try {
            const message = {
                domain: this.domain,
                ...evt
            };
            
            this.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(`SubConnector[${this.domain}:${this.playerId}] - Send error:`, error);
            this.handleDisconnect(error as Error);
        }
    }

    /**
     * 注册客户端消息回调
     */
    onClientMessage(cb: (evt: CEvt) => void): void {
        this.messageHandlers.push(cb);
    }

    /**
     * 注册连接建立回调
     */
    onOpen(cb: () => void): void {
        this.openHandlers.push(cb);
        
        // 如果已经连接，立即触发
        if (this.ready) {
            cb();
        }
    }

    /**
     * 注册连接关闭回调
     */
    onClose(cb: (code: number, reason: string) => void): void {
        this.closeHandlers.push(cb);
    }

    /**
     * 注册意外断开回调
     */
    onDisconnect(cb: (err?: Error) => void): void {
        this.disconnectHandlers.push(cb);
    }

    /**
     * 注册重连成功回调
     */
    onReconnect(cb: () => void): void {
        this.reconnectHandlers.push(cb);
    }

    /**
     * 主动关闭连接
     */
    close(code?: number, reason?: string): void {
        this._ready = false;
        
        // 触发关闭回调
        this.closeHandlers.forEach(handler => {
            try {
                handler(code || 1000, reason || 'Normal closure');
            } catch (error) {
                console.error(`SubConnector[${this.domain}:${this.playerId}] - Close handler error:`, error);
            }
        });

        // 清理所有回调
        this.messageHandlers = [];
        this.openHandlers = [];
        this.closeHandlers = [];
        this.disconnectHandlers = [];
        this.reconnectHandlers = [];
    }

    /**
     * 处理 WebSocket 关闭事件
     */
    private handleClose(): void {
        this._ready = false;
        
        // 触发关闭回调
        this.closeHandlers.forEach(handler => {
            try {
                handler(1000, 'WebSocket closed');
            } catch (error) {
                console.error(`SubConnector[${this.domain}:${this.playerId}] - Close handler error:`, error);
            }
        });
    }

    /**
     * 处理来自客户端的消息（由 GameService 调用）
     */
    handleMessage(message: any): void {
        if (!this._ready) {
            console.warn(`SubConnector[${this.domain}:${this.playerId}] - Received message while not ready`);
            return;
        }

        this.messageHandlers.forEach(handler => {
            try {
                handler(message as CEvt);
            } catch (error) {
                console.error(`SubConnector[${this.domain}:${this.playerId}] - Message handler error:`, error);
            }
        });
    }

    /**
     * 处理连接断开（由 GameService 调用）
     */
    handleDisconnect(error?: Error): void {
        if (!this._ready) return;

        this._ready = false;
        
        this.disconnectHandlers.forEach(handler => {
            try {
                handler(error);
            } catch (handlerError) {
                console.error(`SubConnector[${this.domain}:${this.playerId}] - Disconnect handler error:`, handlerError);
            }
        });
    }

    /**
     * 处理重连成功（由 GameService 调用）
     */
    handleReconnect(): void {
        this._ready = true;
        
        // 触发重连回调
        this.reconnectHandlers.forEach(handler => {
            try {
                handler();
            } catch (error) {
                console.error(`SubConnector[${this.domain}:${this.playerId}] - Reconnect handler error:`, error);
            }
        });

        // 触发打开回调（重连也算是连接建立）
        this.openHandlers.forEach(handler => {
            try {
                handler();
            } catch (error) {
                console.error(`SubConnector[${this.domain}:${this.playerId}] - Open handler error:`, error);
            }
        });
    }

    /**
     * 获取连接信息（用于调试）
     */
    getInfo(): { playerId: PlayerId; domain: string; ready: boolean } {
        return {
            playerId: this.playerId,
            domain: this.domain,
            ready: this.ready
        };
    }
}
