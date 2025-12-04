import { TerminalAction } from '../components/KeyCombinationModal';

export interface SavedCombination {
  id: string;
  title: string;
  actions: TerminalAction[];
}

export const SAVED_COMBINATIONS_KEY = '@mobifai_saved_combinations';

