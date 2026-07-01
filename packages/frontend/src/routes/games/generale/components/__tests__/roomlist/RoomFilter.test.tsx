import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { RoomFilter } from "~/routes/games/generale/components/roomlist/RoomFilter";

describe("RoomFilter", () => {
  it("renders room name input", () => {
    render(() => <RoomFilter value={{}} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Room name")).toBeInTheDocument();
  });

  it("renders host name input", () => {
    render(() => <RoomFilter value={{}} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Host name")).toBeInTheDocument();
  });

  it("renders mode select", () => {
    render(() => <RoomFilter value={{}} onChange={vi.fn()} />);
    expect(screen.getByText("All modes")).toBeInTheDocument();
  });

  it("renders status select", () => {
    render(() => <RoomFilter value={{}} onChange={vi.fn()} />);
    expect(screen.getByText("Any status")).toBeInTheDocument();
  });

  it("renders Clear button", () => {
    render(() => <RoomFilter value={{}} onChange={vi.fn()} />);
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });
});
