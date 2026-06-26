import { create } from "zustand";

type PlaygroundUiState = {
  selectedMessageId: string | null;
  selectedEventSequence: number | null;
  theme: "dark" | "light";
  setSelectedMessageId(messageId: string | null): void;
  setSelectedEventSequence(sequence: number | null): void;
  toggleTheme(): void;
  resetSelection(): void;
};

export const usePlaygroundUiStore = create<PlaygroundUiState>((set) => ({
  selectedMessageId: null,
  selectedEventSequence: null,
  theme: "dark",
  setSelectedMessageId: (selectedMessageId) => set({ selectedMessageId }),
  setSelectedEventSequence: (selectedEventSequence) =>
    set({ selectedEventSequence }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  resetSelection: () =>
    set({ selectedMessageId: null, selectedEventSequence: null }),
}));
