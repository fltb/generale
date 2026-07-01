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

vi.mock("~/routes/games/generale/api/gameApi", () => ({
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

import CreateRoomModal from "~/routes/games/generale/components/roomlist/CreateRoomModal";

describe("CreateRoomModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal when open", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("New Room")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(() => <CreateRoomModal open={() => false} onClose={vi.fn()} />);
    expect(screen.queryByText("New Room")).not.toBeInTheDocument();
  });

  it("renders room name input", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText("e.g. alice's room")).toBeInTheDocument();
  });

  it("renders password input", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText("Leave empty for public room")).toBeInTheDocument();
  });

  it("renders mode select", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("Quick")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders map size select for standard mode", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("Default (medium)")).toBeInTheDocument();
    expect(screen.getByText("Small (10×10)")).toBeInTheDocument();
    expect(screen.getByText("Medium (20×20)")).toBeInTheDocument();
    expect(screen.getByText("Large (40×40)")).toBeInTheDocument();
  });

  it("does not show map size select for custom mode", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    // Default is standard, switch to custom
    const modeSelect = screen.getByDisplayValue("Quick") as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: "custom" } });
    expect(screen.queryByText("Default (medium)")).not.toBeInTheDocument();
  });

  it("shows advanced settings toggle", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("Advanced Settings")).toBeInTheDocument();
  });

  it("shows advanced content when toggled", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Advanced Settings"));
    expect(screen.getByText("Max Players")).toBeInTheDocument();
    expect(screen.getByText("Team Mode")).toBeInTheDocument();
    expect(screen.getByText("Game Mode (optional)")).toBeInTheDocument();
  });

  it("shows custom map section when type is custom and advanced open", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    // Switch to custom
    const modeSelect = screen.getByDisplayValue("Quick") as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: "custom" } });
    // Custom mode auto-opens advanced
    expect(screen.getByText("Custom Map")).toBeInTheDocument();
  });

  it("shows width/height inputs in custom mode", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    const modeSelect = screen.getByDisplayValue("Quick") as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: "custom" } });
    const inputs = screen.getAllByPlaceholderText("10-500");
    expect(inputs).toHaveLength(2);
  });

  it("shows alert when submitting empty room name", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Create Room"));
    expect(alertSpy).toHaveBeenCalledWith("Please enter a room name");
  });

  it("calls mutate when submitting valid form", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText("e.g. alice's room");
    fireEvent.input(nameInput, { target: { value: "Test Room" } });
    fireEvent.click(screen.getByText("Create Room"));
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
    expect(screen.getByText("Create Room")).toBeInTheDocument();
  });

  it("shows cancel button", () => {
    render(() => <CreateRoomModal open={() => true} onClose={vi.fn()} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});
