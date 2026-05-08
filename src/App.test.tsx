import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { treatmentUnits } from "./data/units";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("ETP simulator UI", () => {
  it("starts in fullscreen 3D mode", () => {
    render(<App />);
    expect(screen.getByLabelText("3D wastewater treatment plant")).toBeInTheDocument();
  });

  it("renders all configured treatment units", () => {
    render(<App />);

    const plant = screen.getByTestId("plant-map");
    const unitButtons = within(plant).getAllByRole("button");
    expect(unitButtons).toHaveLength(treatmentUnits.length);
  });

  it("opens the process manual and switches to the sludge explanation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "คู่มือระบบ" }));
    expect(screen.getByRole("dialog", { name: "คู่มืออธิบายขบวนการทำงาน" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3 ขบวนการตะกอน Sludge and RAS line" }));
    expect(screen.getByText(/RAS = Return Activated Sludge/)).toBeInTheDocument();
    expect(screen.getByText(/บ่อ 5 ไม่มีท่อตรงไปบ่อ 8/)).toBeInTheDocument();
  }, 15000);
});
