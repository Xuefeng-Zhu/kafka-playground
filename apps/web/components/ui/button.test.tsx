import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("does not animate disabled opacity when a button becomes enabled", () => {
    const { rerender } = render(
      <Button disabled variant="secondary">
        Reset
      </Button>,
    );

    rerender(<Button variant="secondary">Reset</Button>);

    const classes = screen.getByRole("button", { name: "Reset" }).classList;
    expect(classes.contains("transition-colors")).toBe(true);
    expect(classes.contains("transition")).toBe(false);
  });
});
