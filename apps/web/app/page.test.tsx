import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRIMARY_SCENARIO, SCENARIOS } from "@kplay/scenario-engine";
import HomePage from "./page";

describe("HomePage", () => {
  it("links primary calls to action to the configured primary scenario", () => {
    render(<HomePage />);

    const primaryHref = `/scenarios/${PRIMARY_SCENARIO.id}`;
    expect(
      screen
        .getByRole("link", { name: /Open playground/ })
        .getAttribute("href"),
    ).toBe(primaryHref);
    expect(
      screen
        .getByRole("link", { name: new RegExp(PRIMARY_SCENARIO.title) })
        .getAttribute("href"),
    ).toBe(primaryHref);
  });

  it("does not duplicate the primary scenario in the secondary catalog", () => {
    render(<HomePage />);

    const links = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(
      links.filter((href) => href === `/scenarios/${PRIMARY_SCENARIO.id}`),
    ).toHaveLength(2);
    for (const scenario of SCENARIOS.filter(
      (item) => item.id !== PRIMARY_SCENARIO.id,
    )) {
      expect(links).toContain(`/scenarios/${scenario.id}`);
    }
  });
});
