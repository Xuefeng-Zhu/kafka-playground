import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStoredValue,
  removeStoredValue,
  setStoredValue,
} from "./safe-storage";

describe("safe storage helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("reads, writes, and removes localStorage values", () => {
    setStoredValue("key", "value");

    expect(getStoredValue("key")).toBe("value");

    removeStoredValue("key");

    expect(getStoredValue("key")).toBeNull();
  });

  it("treats storage access failures as unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(getStoredValue("key")).toBeNull();
    expect(() => setStoredValue("key", "value")).not.toThrow();
    expect(() => removeStoredValue("key")).not.toThrow();
  });
});
