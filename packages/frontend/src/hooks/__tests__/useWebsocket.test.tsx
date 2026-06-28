import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { WebSocketProvider, useWS } from "../useWebsocket";

vi.mock("~/ws/manager", () => ({
  ClientConnectionManager: vi.fn(() => ({
    connect: vi.fn(),
    close: vi.fn(),
    getOrCreateSub: vi.fn(),
    openDomain: vi.fn(),
    isConnected: false,
  })),
  SubConnectorClient: vi.fn(),
}));

vi.mock("~/testBridge", () => ({ default: {} }));

describe("useWebsocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children inside WebSocketProvider", () => {
    render(() => (
      <WebSocketProvider>
        <div data-testid="child">content</div>
      </WebSocketProvider>
    ));
    expect(screen.getByTestId("child")).toHaveTextContent("content");
  });

  it("useWS returns manager object inside provider", () => {
    function Consumer() {
      const mgr = useWS();
      return <div data-testid="mgr">{typeof mgr}</div>;
    }
    render(() => (
      <WebSocketProvider autoConnect={false}>
        <Consumer />
      </WebSocketProvider>
    ));
    expect(screen.getByTestId("mgr")).toHaveTextContent("object");
  });

  it("throws when useWS is used outside WebSocketProvider", () => {
    const orig = console.error;
    console.error = vi.fn();
    function Bad() {
      useWS();
      return <div />;
    }
    expect(() => render(() => <Bad />)).toThrow(
      "useWS must be used inside WebSocketProvider",
    );
    console.error = orig;
  });
});
