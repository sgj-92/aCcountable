/**
 * The day's plan as it stands: what's been logged, what's still to eat, and the
 * amounts for the rest so the day lands on target. Shared by Today and Plan.
 */
import type { FoodEntry } from './api';
import { sumTotals } from './nutrition';
import { addMacros, planGaps, solvePlan, subtractMacros, type Macros } from './planner';
import { toPlanFood, type PlanItem } from './plans';

export function planDay(items: PlanItem[], food: FoodEntry[], target: Macros | null) {
  const eaten = sumTotals(food);
  const consumed: Macros = { kcal: eaten.kcal, protein_g: eaten.proteinG, carbs_g: eaten.carbsG, fat_g: eaten.fatG };
  const loggedGrams = new Map(food.map((f) => [f.id, f.grams ?? 0]));
  const isLogged = (i: PlanItem) => !!i.logged_entry_id && loggedGrams.has(i.logged_entry_id);
  const open = items.filter((i) => !isLogged(i));
  const solution = target ? solvePlan(open.map(toPlanFood), subtractMacros(target, consumed), target) : null;
  const planned = solution ? addMacros(consumed, solution.totals) : null;
  const gaps = planned && target ? planGaps(planned, target) : [];
  /** Grams for an item: what was logged, or the planned amount for what's still to eat. */
  const gramsFor = (i: PlanItem) =>
    isLogged(i) ? (loggedGrams.get(i.logged_entry_id!) ?? 0) : (solution?.grams[i.id] ?? i.typical_g);
  return { consumed, isLogged, open, solution, planned, gaps, gramsFor };
}
