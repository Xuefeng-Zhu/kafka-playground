import { describe, expect, it } from "vitest";
import { connectionStatusLabel } from "./connection-labels";

describe("connectionStatusLabel", () => {
  it("labels every connection status with optional context overrides", () => {
    expect(connectionStatusLabel(null)).toBe("Checking");
    expect(connectionStatusLabel(null, { emptyLabel: "Ready" })).toBe("Ready");
    expect(connectionStatusLabel({ status: "connected" })).toBe("Connected");
    expect(connectionStatusLabel({ status: "disconnected" })).toBe(
      "Disconnected",
    );
    expect(connectionStatusLabel({ status: "configuration_missing" })).toBe(
      "Configuration missing",
    );
    expect(connectionStatusLabel({ status: "connection_failed" })).toBe(
      "Connection failed",
    );
    expect(connectionStatusLabel({ status: "demo_mode" })).toBe("Demo mode");
    expect(
      connectionStatusLabel(
        { status: "demo_mode" },
        { labels: { demo_mode: "Local demo runtime" } },
      ),
    ).toBe("Local demo runtime");
  });
});
