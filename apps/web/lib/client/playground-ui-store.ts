import { create } from "zustand";
import type { FocusRef } from "./scenario-experience";

type PlaygroundUiState = {
  focus: FocusRef | null;
  setFocus(focus: FocusRef | null): void;
  resetFocus(): void;
};

export const usePlaygroundUiStore = create<PlaygroundUiState>((set) => ({
  focus: null,
  setFocus: (focus) => set({ focus }),
  resetFocus: () => set({ focus: null }),
}));
