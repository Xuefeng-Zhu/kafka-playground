import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMobileTopology } from "./use-mobile-topology";

describe("useMobileTopology", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares one matchMedia listener across subscribers", () => {
    let matches = false;
    let changeListener: (() => void) | null = null;
    const addEventListener = vi.fn((_type: string, listener: () => void) => {
      changeListener = listener;
    });
    const removeEventListener = vi.fn();
    const matchMedia = vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    const view = render(
      <>
        <MobileValue testId="first" />
        <MobileValue testId="second" />
      </>,
    );

    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("first").textContent).toBe("wide");
    expect(screen.getByTestId("second").textContent).toBe("wide");

    act(() => {
      matches = true;
      changeListener?.();
    });

    expect(screen.getByTestId("first").textContent).toBe("mobile");
    expect(screen.getByTestId("second").textContent).toBe("mobile");

    view.unmount();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});

function MobileValue({ testId }: { testId: string }) {
  const mobile = useMobileTopology();
  return <span data-testid={testId}>{mobile ? "mobile" : "wide"}</span>;
}
