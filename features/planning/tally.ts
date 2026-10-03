import type { OptionFit } from './optionFit';
import type { TripOption, Vote } from './types';

export interface OptionResult {
  option: TripOption;
  likes: number;
  likerIds: string[];
  fit: OptionFit;
}

/**
 * Most likes wins. Ties: more people free, then fewer people over budget,
 * then cheaper, then the order the options were made in.
 */
export function rankOptions(options: TripOption[], votes: Vote[], fits: Map<string, OptionFit>): OptionResult[] {
  return options
    .map((option) => {
      const likerIds = votes.filter((v) => v.option_id === option.id && v.liked).map((v) => v.member_id);
      return { option, likes: likerIds.length, likerIds, fit: fits.get(option.id)! };
    })
    .sort(
      (a, b) =>
        b.likes - a.likes ||
        (b.fit.window?.freeCount ?? 0) - (a.fit.window?.freeCount ?? 0) ||
        a.fit.overBudget - b.fit.overBudget ||
        a.option.cost_per_person - b.option.cost_per_person ||
        a.option.position - b.option.position,
    );
}

/** Member ids who have swiped every option. */
export function finishedSwiping(options: TripOption[], votes: Vote[], memberIds: string[]): string[] {
  return memberIds.filter((id) => options.every((o) => votes.some((v) => v.member_id === id && v.option_id === o.id)));
}

/** "4 of 4 liked", "1 like", "0 likes". */
export function likesLabel(likes: number): string {
  return `${likes} like${likes === 1 ? '' : 's'}`;
}
