import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "./workspace-header";

describe("WorkspaceHeader view switch", () => {
  it("renders an accessible Guided and Explore tablist", () => {
    renderHeader();

    expect(screen.getByRole("tablist", { name: "Workspace view" })).toBe(
      screen.getByTestId("workspace-view-guided").parentElement,
    );

    const guidedTab = screen.getByRole("tab", { name: "Guided" });
    const exploreTab = screen.getByRole("tab", { name: "Explore" });
    expect(guidedTab.getAttribute("aria-selected")).toBe("true");
    expect(guidedTab.getAttribute("aria-controls")).toBe(
      "workspace-guided-panel",
    );
    expect(guidedTab.getAttribute("tabindex")).toBe("0");
    expect(exploreTab.getAttribute("aria-selected")).toBe("false");
    expect(exploreTab.getAttribute("aria-controls")).toBe(
      "workspace-explore-panel",
    );
    expect(exploreTab.getAttribute("tabindex")).toBe("-1");
  });

  it("changes views by pointer and automatic keyboard navigation", () => {
    const onWorkspaceViewChange = vi.fn();
    renderHeader({ onWorkspaceViewChange });

    const guidedTab = screen.getByRole("tab", { name: "Guided" });
    const exploreTab = screen.getByRole("tab", { name: "Explore" });

    fireEvent.click(exploreTab);
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith("explore");

    fireEvent.keyDown(guidedTab, { key: "End" });
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith("explore");
    expect(document.activeElement).toBe(exploreTab);

    fireEvent.keyDown(exploreTab, { key: "Home" });
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith("guided");
    expect(document.activeElement).toBe(guidedTab);

    fireEvent.keyDown(guidedTab, { key: "ArrowLeft" });
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith("explore");
    expect(document.activeElement).toBe(exploreTab);
  });

  it("disables both view tabs while workspace actions are pending", () => {
    const onWorkspaceViewChange = vi.fn();
    renderHeader({ disabled: true, onWorkspaceViewChange });

    const guidedTab = screen.getByRole("tab", { name: "Guided" });
    const exploreTab = screen.getByRole("tab", { name: "Explore" });
    expect((guidedTab as HTMLButtonElement).disabled).toBe(true);
    expect((exploreTab as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(exploreTab);
    expect(onWorkspaceViewChange).not.toHaveBeenCalled();
  });

  it("hides the switch when Guided is unavailable", () => {
    renderHeader({ canSwitchWorkspaceView: false });

    expect(
      screen.queryByRole("tablist", { name: "Workspace view" }),
    ).toBeNull();
  });

  it("keeps the saved switch visible but disabled before a run starts", () => {
    renderHeader({
      canSwitchWorkspaceView: false,
      showWorkspaceViewSwitch: true,
    });

    const tablist = screen.getByRole("tablist", { name: "Workspace view" });
    const reasonId = tablist.getAttribute("aria-describedby");
    expect(tablist.getAttribute("title")).toBe(
      "Start a run to use Guided or Explore.",
    );
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId!)?.textContent).toContain(
      "Start a run to use Guided or Explore.",
    );
    for (const label of ["Guided", "Explore"]) {
      const tab = screen.getByRole("tab", { name: label });
      expect((tab as HTMLButtonElement).disabled).toBe(true);
      expect(tab.getAttribute("aria-controls")).toBeNull();
    }
  });

  it("keeps reset without repeating the run status already conveyed by runtime mode", () => {
    renderHeader();

    expect(screen.queryByText("Run status")).toBeNull();
    expect(screen.getByRole("button", { name: "Reset run" })).not.toBeNull();
  });

  it("uses compact desktop tabs and keeps 44px mobile targets", () => {
    renderHeader();

    const tablist = screen.getByRole("tablist", {
      name: "Workspace view",
    });
    const tablistWrapper = tablist.parentElement;
    expect(tablistWrapper?.className).toContain("basis-full");
    expect(tablistWrapper?.className).toContain("w-full");
    expect(tablist.className).toContain("p-0.5");
    expect(tablist.className).toContain("md:h-9");
    for (const label of ["Guided", "Explore"]) {
      const tab = screen.getByRole("tab", { name: label });
      expect(tab.className).toContain("min-h-11");
      expect(tab.className).toContain("md:min-h-7");
      expect(tab.className).toContain("md:text-xs");
      expect(tab.className).toContain("items-center");
      expect(tab.className).toContain("justify-center");
      expect(tab.className).toContain("text-center");
    }
  });
});

function renderHeader({
  disabled = false,
  canSwitchWorkspaceView = true,
  showWorkspaceViewSwitch,
  onWorkspaceViewChange = vi.fn(),
}: {
  disabled?: boolean;
  canSwitchWorkspaceView?: boolean;
  showWorkspaceViewSwitch?: boolean;
  onWorkspaceViewChange?: (view: "guided" | "explore") => void;
} = {}) {
  return render(
    <WorkspaceHeader
      run={null}
      connection={null}
      disabled={disabled}
      onReset={vi.fn()}
      workspaceView="guided"
      showWorkspaceViewSwitch={showWorkspaceViewSwitch}
      canSwitchWorkspaceView={canSwitchWorkspaceView}
      onWorkspaceViewChange={onWorkspaceViewChange}
    />,
  );
}
