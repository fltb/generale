/**
 * WebSocket功能演示
 * 这个文件展示了如何使用重构后的WebSocket插件
 */

import { registerDomainHandler, unregisterDomainHandler } from '../websocket';

// 演示1: 注册游戏域名处理器
export function setupGameDomain() {
  const gameHandler = {
    onOpen: (connectionId: string, config: any) => {
      console.log(`🎮 游戏连接打开: ${connectionId}`, config);
      // 这里可以初始化玩家游戏状态
      // gameService.initializePlayer(connectionId, config);
    },
    
    onMessage: (connectionId: string, payload: any) => {
      console.log(`🎮 收到游戏消息: ${connectionId}`, payload);
      
      // 处理不同的游戏动作
      switch (payload.action) {
        case 'move':
          console.log(`玩家 ${connectionId} 移动到 ${payload.position.x}, ${payload.position.y}`);
          break;
        case 'attack':
          console.log(`玩家 ${connectionId} 攻击目标 ${payload.target}`);
          break;
        case 'ready':
          console.log(`玩家 ${connectionId} 准备就绪`);
          break;
        default:
          console.log(`未知游戏动作: ${payload.action}`);
      }
    },
    
    onClose: (connectionId: string, code?: number, reason?: string) => {
      console.log(`🎮 游戏连接关闭: ${connectionId}`, { code, reason });
      // 清理玩家游戏状态
      // gameService.removePlayer(connectionId);
    },
    
    onDisconnect: (connectionId: string) => {
      console.log(`🎮 游戏连接断开: ${connectionId}`);
      // 处理意外断开连接
      // gameService.handlePlayerDisconnect(connectionId);
    },
    
    onReconnect: (connectionId: string) => {
      console.log(`🎮 游戏重新连接: ${connectionId}`);
      // 恢复玩家状态
      // gameService.restorePlayerState(connectionId);
    }
  };
  
  registerDomainHandler('game', gameHandler);
  console.log('✅ 游戏域名处理器已注册');
}

// 演示2: 注册聊天域名处理器
export function setupChatDomain() {
  const chatHandler = {
    onOpen: (connectionId: string, config: any) => {
      console.log(`💬 聊天连接打开: ${connectionId}`, config);
      // 初始化聊天状态
      // chatService.joinChat(connectionId, config.chatRoom);
    },
    
    onMessage: (connectionId: string, payload: any) => {
      console.log(`💬 收到聊天消息: ${connectionId}`, payload);
      
      switch (payload.type) {
        case 'message':
          console.log(`聊天消息: ${payload.content}`);
          // 广播消息给其他玩家
          // chatService.broadcastMessage(connectionId, payload.content);
          break;
        case 'emoji':
          console.log(`表情: ${payload.emoji}`);
          break;
        case 'typing':
          console.log(`${connectionId} 正在输入...`);
          break;
      }
    },
    
    onClose: (connectionId: string) => {
      console.log(`💬 聊天连接关闭: ${connectionId}`);
      // 离开聊天室
      // chatService.leaveChat(connectionId);
    }
  };
  
  registerDomainHandler('chat', chatHandler);
  console.log('✅ 聊天域名处理器已注册');
}

// 演示3: 注册游戏前准备域名处理器
export function setupPregameDomain() {
  const pregameHandler = {
    onOpen: (connectionId: string, config: any) => {
      console.log(`🔄 游戏前连接打开: ${connectionId}`, config);
      // 加入游戏房间
      // pregameService.joinRoom(connectionId, config.roomId);
    },
    
    onMessage: (connectionId: string, payload: any) => {
      console.log(`🔄 收到游戏前消息: ${connectionId}`, payload);
      
      switch (payload.action) {
        case 'ready':
          console.log(`玩家 ${connectionId} 准备就绪`);
          // 检查是否所有玩家都准备好了
          // pregameService.checkAllReady(connectionId);
          break;
        case 'change_settings':
          console.log(`房主 ${connectionId} 修改游戏设置:`, payload.settings);
          // 同步设置给所有玩家
          // pregameService.updateSettings(payload.settings);
          break;
        case 'start_game':
          console.log(`开始游戏: ${connectionId}`);
          // 启动游戏
          // pregameService.startGame(connectionId);
          break;
      }
    },
    
    onClose: (connectionId: string) => {
      console.log(`🔄 游戏前连接关闭: ${connectionId}`);
      // 离开房间
      // pregameService.leaveRoom(connectionId);
    }
  };
  
  registerDomainHandler('pregame', pregameHandler);
  console.log('✅ 游戏前域名处理器已注册');
}

// 演示4: 完整的域名设置
export function setupAllDomains() {
  console.log('🚀 开始设置所有域名处理器...');
  
  setupGameDomain();
  setupChatDomain();
  setupPregameDomain();
  
  console.log('✅ 所有域名处理器设置完成!');
  console.log('📝 可用域名: game, chat, pregame');
}

// 演示5: 清理域名处理器
export function cleanupAllDomains() {
  console.log('🧹 清理所有域名处理器...');
  
  unregisterDomainHandler('game');
  unregisterDomainHandler('chat');
  unregisterDomainHandler('pregame');
  
  console.log('✅ 所有域名处理器已清理');
}

// 演示6: 客户端消息格式示例
export const CLIENT_MESSAGE_EXAMPLES = {
  // 打开游戏sub-connector
  openGame: {
    domain: 'game',
    type: 'open',
    payload: { 
      playerId: 'player123',
      gameId: 'game456'
    }
  },
  
  // 游戏移动消息
  gameMove: {
    domain: 'game',
    type: 'message',
    payload: {
      action: 'move',
      position: { x: 10, y: 20 }
    }
  },
  
  // 聊天消息
  chatMessage: {
    domain: 'chat',
    type: 'message',
    payload: {
      type: 'message',
      content: 'Hello everyone!'
    }
  },
  
  // 游戏前准备
  pregameReady: {
    domain: 'pregame',
    type: 'message',
    payload: {
      action: 'ready'
    }
  },
  
  // 关闭sub-connector
  closeGame: {
    domain: 'game',
    type: 'close',
    payload: {
      code: 1000,
      reason: 'Game ended'
    }
  }
};

// 演示7: 服务器响应格式示例
export const SERVER_RESPONSE_EXAMPLES = {
  // 连接确认
  connectionAck: {
    type: 'connection_ack',
    payload: {
      connectionId: 'conn_1234567890_abc123'
    }
  },
  
  // sub-connector打开确认
  openAck: {
    type: 'open_ack',
    domain: 'game',
    payload: {
      success: true,
      config: { playerId: 'player123' }
    }
  },
  
  // sub-connector关闭确认
  closeAck: {
    type: 'close_ack',
    domain: 'game',
    payload: {
      success: true,
      code: 1000,
      reason: 'Normal closure'
    }
  },
  
  // 错误响应
  error: {
    type: 'error',
    domain: 'game',
    payload: {
      error: 'Domain not found'
    }
  }
};

// 如果直接运行此文件，则设置演示环境
if (import.meta.main) {
  setupAllDomains();
  
  console.log('\n📋 客户端消息示例:');
  console.log(JSON.stringify(CLIENT_MESSAGE_EXAMPLES, null, 2));
  
  console.log('\n📋 服务器响应示例:');
  console.log(JSON.stringify(SERVER_RESPONSE_EXAMPLES, null, 2));
}
