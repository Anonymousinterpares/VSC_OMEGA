import { create } from 'zustand';
import { ISearchResult, ISearchOptions } from '@/shared/types';
import { CHANNELS } from '@/shared/constants';

interface SearchState {
  query: string;
  results: ISearchResult[];
  isSearching: boolean;
  options: ISearchOptions;
  highlightTarget: { filePath: string; line: number; range: { startColumn: number; endColumn: number } } | null;
  
  setQuery: (query: string) => void;
  setOptions: (options: Partial<ISearchOptions>) => void;
  performSearch: () => Promise<void>;
  performReplace: (replaceText: string) => Promise<void>;
  clearResults: () => void;
  setHighlightTarget: (target: SearchState['highlightTarget']) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  isSearching: false,
  options: {
    query: '',
    matchCase: false,
    matchWholeWord: false,
    useRegex: false,
    includes: '',
    excludes: ''
  },
  highlightTarget: null,

  setQuery: (query) => set((state) => ({ 
      query, 
      options: { ...state.options, query } 
  })),

  setOptions: (newOptions) => set((state) => ({ 
      options: { ...state.options, ...newOptions } 
  })),

  performSearch: async () => {
    const { options } = get();
    if (!options.query.trim()) return;

    set({ isSearching: true, results: [] });

    try {
        if (window.electron) {
            const results = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SEARCH_IN_FILES, options);
            set({ results });
        }
    } catch (error) {
        console.error("Search failed:", error);
    } finally {
        set({ isSearching: false });
    }
  },

  performReplace: async (replaceText: string) => {
    const { options } = get();
    if (!options.query.trim()) return;

    set({ isSearching: true });
    try {
        if (window.electron) {
            await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.REPLACE_IN_FILES, { options, replaceText });
            // Refresh results after replace
            const results = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SEARCH_IN_FILES, options);
            set({ results });
        }
    } catch (error) {
        console.error("Replace failed:", error);
    } finally {
        set({ isSearching: false });
    }
  },

  clearResults: () => set({ results: [] }),
  setHighlightTarget: (target) => set({ highlightTarget: target })
}));
