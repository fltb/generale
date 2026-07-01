import { type GameId, GamePhase } from "@generale/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneraleRoom } from "../../instance/GeneraleRoom";
import { GeneraleGame } from "../../instance/GeneraleGame";
import { GeneraleService, type GeneraleServiceConfig } from "../GeneraleService";
import type { WSContextBase } from "../../../../plugins/websocket";

// Mock SubConnector
const createMockSubConnector = (context: Partial<WSContextBase> = {}) => ({
  context: { userid: "test-user", username: "Test User", ...context },
  close: vi.fn(),
  send: vi.fn(),
  onMessage: vi.fn(),
  onClose: vi.fn(),
  onOpen: vi.fn(),
  onClientMessage: vi.fn(),
  domain: "mock-domain",
  ready: true,
  onDisconnect: vi.fn(),
  onReconnect: vi.fn(),
  getConnectionId: vi.fn(() => "mock-conn-id"),
  getContext: vi.fn(function () {
    return this.context;
  }),
});

// Mock dependencies
vi.mock("../../../../plugins/websocket", () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

vi.mock("../../instance/GeneraleRoom", () => ({
  GeneraleRoom: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: [],
      playerLimit: 8,
    }),
    destroy: vi.fn(),
    onStateChange: vi.fn(() => () => {}),
    onDisband: vi.fn(() => () => {}),
    broadcastGameEnded: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    onStartGame: vi.fn(),
  })),
}));

vi.mock("../../instance/GeneraleGame", () => ({
  GeneraleGame: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: {},
      status: "Playing",
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    advance: vi.fn(),
    startTicking: vi.fn(),
    stopTicking: vi.fn(),
    onStartGame: vi.fn(),
  })),
}));

vi.mock("../../../../game/instance/GameChatInstance", () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    onStartGame: vi.fn(),
  })),
}));

function gs(s: GeneraleService) {
  return s as unknown as {
    disbandGame: () => void;
    createRoomDomainHandler: Function;
    roomInstance: GeneraleRoom | null;
    phase: GamePhase;
    gameInstance: GeneraleGame | null;
    createGameDomainHandler: Function;
    createChatDomainHandler: Function;
    chatInstance: { addPlayer: Function };
  };
}

describe("GeneraleService Domain Handlers", () => {
  let generaleService: GeneraleService;
  let config: GeneraleServiceConfig;

  beforeEach(() => {
    config = {
      gameId: "test-game-123" as GameId,
      maxPlayers: 4,
      roomName: "test",
    };
    generaleService = new GeneraleService(config);
  });

  afterEach(() => {
    gs(generaleService).disbandGame();
    vi.clearAllMocks();
  });

  describe("Pregame Domain Handler", () => {
    it("应该接受有效的 pregame 连接", () => {
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createRoomDomainHandler();

      handler(connector);

      expect(connector.close).not.toHaveBeenCalled();
      expect(gs(generaleService).roomInstance).toBeTruthy();
    });

    it("应该拒绝缺少 userid 的连接", () => {
      const connector = createMockSubConnector({ userid: null });
      const handler = gs(generaleService).createRoomDomainHandler();

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4001, "Missing userid");
    });

    it("应该拒绝缺少 username 的连接", () => {
      const connector = createMockSubConnector({ username: null });
      const handler = gs(generaleService).createRoomDomainHandler();
      handler(connector);
      expect(connector.close).toHaveBeenCalledWith(4001, "Missing username");
    });

    it("应该在 INGAME 阶段允许 room 连接", () => {
      gs(generaleService).phase = GamePhase.INGAME;
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createRoomDomainHandler();
      handler(connector);
      expect(connector.close).not.toHaveBeenCalled();
    });

    it("应该处理 GeneraleRoom 添加玩家失败", () => {
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createRoomDomainHandler();

      // Mock GeneraleRoom.addPlayer 返回失败
      const mockRoomInstance = {
        addPlayer: vi.fn().mockReturnValue({ success: false }),
        destroy: vi.fn(),
      };
      gs(generaleService).roomInstance = mockRoomInstance as unknown as GeneraleRoom;

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4003, "Failed to add to room");
    });
  });

  describe("Game Domain Handler", () => {
    beforeEach(() => {
      gs(generaleService).phase = GamePhase.INGAME;
      gs(generaleService).gameInstance = new GeneraleGame();
    });

    it("应该接受有效的 game 连接", () => {
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createGameDomainHandler();

      handler(connector);

      expect(connector.close).not.toHaveBeenCalled();
    });

    it("应该拒绝缺少 userid 的连接", () => {
      const connector = createMockSubConnector({ userid: null });
      const handler = gs(generaleService).createGameDomainHandler();

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4001, "Missing userid");
    });

    it("应该拒绝非 INGAME 阶段的连接", () => {
      gs(generaleService).phase = GamePhase.PREGAME;
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createGameDomainHandler();

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4002, "Invalid phase for game");
    });

    it("应该处理 GeneraleGame 添加玩家失败", () => {
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createGameDomainHandler();

      // Mock GeneraleGame.addPlayer 返回失败
      gs(generaleService).gameInstance!.addPlayer = vi.fn().mockReturnValue({
        success: false,
        message: "Player already exists",
      });

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4003, "Player already exists");
    });
  });

  describe("Chat Domain Handler", () => {
    it("应该在 PREGAME 阶段接受 chat 连接", () => {
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createChatDomainHandler();

      handler(connector);

      expect(connector.close).not.toHaveBeenCalled();
    });

    it("应该在 INGAME 阶段接受 chat 连接", () => {
      gs(generaleService).phase = GamePhase.INGAME;
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createChatDomainHandler();

      handler(connector);

      expect(connector.close).not.toHaveBeenCalled();
    });

    it("应该在 ENDED 阶段接受 chat 连接", () => {
      gs(generaleService).phase = GamePhase.ENDED;
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createChatDomainHandler();

      handler(connector);

      expect(connector.close).not.toHaveBeenCalled();
    });

    it("应该拒绝 DISBANDED 阶段的连接", () => {
      gs(generaleService).phase = GamePhase.DISBANDED;
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createChatDomainHandler();

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4004, "Game disbanded");
    });

    it("应该拒绝缺少 userid 的连接", () => {
      const connector = createMockSubConnector({ userid: null });
      const handler = gs(generaleService).createChatDomainHandler();

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4001, "Missing userid");
    });

    it("应该处理 ChatInstance 添加玩家失败", () => {
      const connector = createMockSubConnector();
      const handler = gs(generaleService).createChatDomainHandler();

      // Mock ChatInstance.addPlayer 返回失败
      gs(generaleService).chatInstance.addPlayer = vi.fn().mockReturnValue({
        success: false,
        message: "Chat full",
      });

      handler(connector);

      expect(connector.close).toHaveBeenCalledWith(4003, "Chat full");
    });
  });
});
