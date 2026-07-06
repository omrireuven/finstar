import { create } from 'zustand';

export type SyncStepStatus = 'pending' | 'active' | 'success' | 'error';

export interface SyncStep {
  id: string;
  label: string;
  status: SyncStepStatus;
  tooltip?: string;
  details?: {
    categorizedTxns?: number;
    uniqueBusinesses?: number;
    totalTxns?: number;
    toLinkCount?: number;
    toDeleteCount?: number;
    log?: { prompt: string; response: string };
  };
}

interface SyncProgressState {
  isActive: boolean;
  steps: SyncStep[];
  startSync: (steps: Omit<SyncStep, 'status'>[]) => void;
  updateStep: (id: string, updates: Partial<SyncStep>) => void;
  finishSync: () => void;
  resetSync: () => void;
}

export const useSyncProgress = create<SyncProgressState>((set) => ({
  isActive: false,
  steps: [],
  startSync: (initialSteps) => set({
    isActive: true,
    steps: initialSteps.map(s => ({ ...s, status: 'pending' }))
  }),
  updateStep: (id, updates) => set((state) => ({
    steps: state.steps.map(s => s.id === id ? { ...s, ...updates } : s)
  })),
  finishSync: () => {
    // We don't hide immediately, the component will handle the 10s delay.
    // We just mark everything that is 'pending' or 'active' as 'success' if they weren't errored
    set((state) => ({
      steps: state.steps.map(s => 
        (s.status === 'pending' || s.status === 'active') ? { ...s, status: 'success' } : s
      )
    }));
  },
  resetSync: () => set({ isActive: false, steps: [] })
}));
