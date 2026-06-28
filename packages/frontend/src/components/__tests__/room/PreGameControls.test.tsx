import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { PreGameControls } from "~/components/room/PreGameControls";

describe("PreGameControls", () => {
  const defaultProps = () => ({
    started: false,
    isHost: false,
    ready: false,
    onReadyToggle: vi.fn(),
    onStartGame: vi.fn(),
    onLeave: vi.fn(),
    onDisband: vi.fn(),
  });

  it("renders ready toggle for non-host", () => {
    render(() => <PreGameControls {...defaultProps()} />);
    expect(screen.getByText("准备")).toBeInTheDocument();
  });

  it("does not render ready toggle for host", () => {
    render(() => <PreGameControls {...defaultProps()} isHost={true} />);
    expect(screen.queryByText("准备")).not.toBeInTheDocument();
    expect(screen.queryByText("取消准备")).not.toBeInTheDocument();
  });

  it("renders start game for host", () => {
    render(() => <PreGameControls {...defaultProps()} isHost={true} />);
    expect(screen.getByText("开始游戏")).toBeInTheDocument();
  });

  it("does not render start game for non-host", () => {
    render(() => <PreGameControls {...defaultProps()} />);
    expect(screen.queryByText("开始游戏")).not.toBeInTheDocument();
  });

  it("renders leave room for all", () => {
    render(() => <PreGameControls {...defaultProps()} />);
    expect(screen.getByText("离开房间")).toBeInTheDocument();
  });

  it("renders disband room for host", () => {
    render(() => <PreGameControls {...defaultProps()} isHost={true} />);
    expect(screen.getByText("解散房间")).toBeInTheDocument();
  });

  it("does not render disband room for non-host", () => {
    render(() => <PreGameControls {...defaultProps()} />);
    expect(screen.queryByText("解散房间")).not.toBeInTheDocument();
  });

  it("host buttons disabled when started", () => {
    render(() => <PreGameControls {...defaultProps()} isHost={true} started={true} />);
    expect(screen.getByText("开始游戏").closest("button")).toBeDisabled();
  });

  it("ready toggle disabled when started", () => {
    render(() => <PreGameControls {...defaultProps()} started={true} />);
    expect(screen.getByText("准备").closest("button")).toBeDisabled();
  });

  it("shows 取消准备 when ready", () => {
    render(() => <PreGameControls {...defaultProps()} ready={true} />);
    expect(screen.getByText("取消准备")).toBeInTheDocument();
    expect(screen.queryByText("准备")).not.toBeInTheDocument();
  });

  it("calls onReadyToggle when ready button clicked", () => {
    const props = defaultProps();
    render(() => <PreGameControls {...props} />);
    fireEvent.click(screen.getByText("准备"));
    expect(props.onReadyToggle).toHaveBeenCalledWith(true);
  });

  it("calls onReadyToggle when unready button clicked", () => {
    const props = defaultProps();
    render(() => <PreGameControls {...props} ready={true} />);
    fireEvent.click(screen.getByText("取消准备"));
    expect(props.onReadyToggle).toHaveBeenCalledWith(false);
  });

  it("calls onStartGame when start button clicked", () => {
    const props = defaultProps();
    render(() => <PreGameControls {...props} isHost={true} />);
    fireEvent.click(screen.getByText("开始游戏"));
    expect(props.onStartGame).toHaveBeenCalled();
  });

  it("calls onLeave when leave button clicked", () => {
    const props = defaultProps();
    render(() => <PreGameControls {...props} />);
    fireEvent.click(screen.getByText("离开房间"));
    expect(props.onLeave).toHaveBeenCalled();
  });

  it("calls onDisband when disband button clicked", () => {
    const props = defaultProps();
    render(() => <PreGameControls {...props} isHost={true} />);
    fireEvent.click(screen.getByText("解散房间"));
    expect(props.onDisband).toHaveBeenCalled();
  });
});
