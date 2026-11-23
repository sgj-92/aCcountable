/** What the macro widget shows: today's eaten amounts against the day's targets. */
export interface MacroWidgetProps {
  /** The day these numbers are for (YYYY-MM-DD). On a later day the widget shows a fresh day. */
  date: string;
  kcal: number;
  kcalTarget: number;
  protein: number;
  proteinTarget: number;
  fat: number;
  fatTarget: number;
  carbs: number;
  carbsTarget: number;
}

export const EMPTY_MACROS: MacroWidgetProps = {
  date: '',
  kcal: 0,
  kcalTarget: 0,
  protein: 0,
  proteinTarget: 0,
  fat: 0,
  fatTarget: 0,
  carbs: 0,
  carbsTarget: 0,
};

export interface MacroWidgetHandle {
  /** Show these numbers now, and a fresh day from midnight (iOS; Android refreshes when the app next updates it). */
  show(props: MacroWidgetProps): void;
}
