import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";

const mockMutate = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@tanstack/solid-query", () => ({
  useMutation: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  A: (p: any) => p.children,
  useSearchParams: () => [() => ({}), vi.fn()],
}));

vi.mock("~/api/gameApi", () => ({
  createGameApi: vi.fn(),
}));

vi.mock("~/components/map-editor/MapSelector", () => ({
  MapSelector: (p: any) => (
    <select
      data-testid="map-selector"
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
    >
      <option value="">{p.placeholder}</option>
      <option value="map1">Map 1</option>
    </select>
  ),
}));

const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

import CreateRoomModal from "~/components/roomlist/CreateRoomModal";

describe("CreateRoomModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal when open", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("新建房间")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(() => <CreateRoomModal open={() => false} onClose={vi.fn()} />);
    expect(screen.queryByText("新建房间")).not.toBeInTheDocument();
  });

  it("renders room name input", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText("例如：alice 的房间")).toBeInTheDocument();
  });

  it("renders password input", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText("留空为公开房间")).toBeInTheDocument();
  });

  it("renders mode select", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("快速")).toBeInTheDocument();
    expect(screen.getByText("自定义")).toBeInTheDocument();
  });

  it("renders map size select for standard mode", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("默认 (medium)")).toBeInTheDocument();
    expect(screen.getByText("Small (10×10)")).toBeInTheDocument();
    expect(screen.getByText("Medium (20×20)")).toBeInTheDocument();
    expect(screen.getByText("Large (40×40)")).toBeInTheDocument();
  });

  it("does not show map size select for custom mode", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    // Default is standard, switch to custom
    const modeSelect = screen.getByDisplayValue("快速") as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: "custom" } });
    expect(screen.queryByText("默认 (medium)")).not.toBeInTheDocument();
  });

  it("shows advanced settings toggle", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("高级设置")).toBeInTheDocument();
  });

  it("shows advanced content when toggled", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("高级设置"));
    expect(screen.getByText("最大玩家数")).toBeInTheDocument();
    expect(screen.getByText("队伍模式")).toBeInTheDocument();
    expect(screen.getByText("游戏玩法（可选）")).toBeInTheDocument();
  });

  it("shows custom map section when type is custom and advanced open", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    // Switch to custom
    const modeSelect = screen.getByDisplayValue("快速") as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: "custom" } });
    // Custom mode auto-opens advanced
    expect(screen.getByText("自定义地图")).toBeInTheDocument();
  });

  it("shows width/height inputs in custom mode", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    const modeSelect = screen.getByDisplayValue("快速") as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: "custom" } });
    const inputs = screen.getAllByPlaceholderText("10-500");
    expect(inputs).toHaveLength(2);
  });

  it("shows alert when submitting empty room name", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("创建房间"));
    expect(alertSpy).toHaveBeenCalledWith("请输入房间名字");
  });

  it("calls mutate when submitting valid form", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText("例如：alice 的房间");
    fireEvent.input(nameInput, { target: { value: "Test Room" } });
    fireEvent.click(screen.getByText("创建房间"));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ roomName: "Test Room" }),
    );
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(() => <CreateRoomModal open={() => true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows submit button with text 创建房间", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("创建房间")).toBeInTheDocument();
  });

  it("shows cancel button", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("取消")).toBeInTheDocument();
  });
});
