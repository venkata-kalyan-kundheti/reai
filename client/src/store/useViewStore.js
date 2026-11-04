import { create } from 'zustand';

export const useViewStore = create((set, get) => ({
  activeSegmentId: null,
  hoveredSegmentId: null,
  hoveredChunkId: null,
  pinnedSourceId: null,
  activePage: 1,
  zoom: 1.0,
  pointingEnabled: true,
  leftPane: 'pdf', // 'pdf' or 'ai'
  collapsedPane: null, // null | 'pdf' | 'ai'
  previewSource: null, // { chunkId, x, y }
  historyStack: [],
  selectionBox: null, // { page, rect }
  isDrawingBox: false,
  level: 'medium',
  goal: 'understanding',

  setActiveSegmentId: (id) => set({ activeSegmentId: id }),
  setHoveredSegmentId: (id) => set({ hoveredSegmentId: id }),
  setHoveredChunkId: (id) => set({ hoveredChunkId: id }),
  setPinnedSourceId: (id) =>
    set((state) => ({ pinnedSourceId: state.pinnedSourceId === id ? null : id })),
  setActivePage: (page) => set({ activePage: page }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2.5, zoom)) }),
  zoomIn: () => set((state) => ({ zoom: Math.min(2.5, state.zoom + 0.15) })),
  zoomOut: () => set((state) => ({ zoom: Math.max(0.5, state.zoom - 0.15) })),
  togglePointing: () => set((state) => ({ pointingEnabled: !state.pointingEnabled })),
  swapSides: () => set((state) => ({ leftPane: state.leftPane === 'pdf' ? 'ai' : 'pdf' })),
  setCollapsedPane: (pane) => set({ collapsedPane: pane }),
  setPreviewSource: (preview) => set({ previewSource: preview }),
  setSelectionBox: (box) => set({ selectionBox: box }),
  setIsDrawingBox: (isDrawing) => set({ isDrawingBox: isDrawing }),
  setLevel: (level) => set({ level }),
  setGoal: (goal) => set({ goal }),

  pushHistory: (item) =>
    set((state) => ({ historyStack: [...state.historyStack.slice(-10), item] })),
  popHistory: () => {
    const stack = [...get().historyStack];
    const prev = stack.pop();
    set({ historyStack: stack });
    return prev;
  },
  clearHistory: () => set({ historyStack: [] }),
}));

