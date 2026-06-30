import { create } from "zustand";

type PlaygroundUiState = {
  selectedMessageId: string | null;
  selectedEventSequence: number | null;
  setSelectedMessageId(messageId: string | null): void;
  setSelectedEventSequence(sequence: number | null): void;
  resetSelection(): void;
};

export const usePlaygroundUiStore = create<PlaygroundUiState>((set) => ({
  selectedMessageId: null,
  selectedEventSequence: null,
  setSelectedMessageId: (selectedMessageId) => set({ selectedMessageId }),
  setSelectedEventSequence: (selectedEventSequence) =>
    set({ selectedEventSequence }),
  resetSelection: () =>
    set({ selectedMessageId: null, selectedEventSequence: null }),
}));
