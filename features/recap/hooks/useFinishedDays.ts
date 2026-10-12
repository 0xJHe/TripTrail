import { useCallback } from "react";

import { addDayFor, dayFinishedFor } from "../dayEnd";
import { useDayClosures } from "./useDayClosures";
import { useOpenDay } from "./useOpenDay";

/**
 * Which trip days are finished (read-only) for this person: closed with Done for today, or
 * the next trip day has started for them (useOpenDay). `days` = the plan's number of days.
 * Every way of adding or changing a stop checks this.
 */
export function useFinishedDays(tripId: string | undefined, days: number) {
  const open = useOpenDay(tripId);
  const closures = useDayClosures(tripId, open.day);
  const { myDays } = closures;
  const isFinished = useCallback(
    (day: number) =>
      dayFinishedFor({ day, openDay: open.day, closedDays: myDays }),
    [open.day, myDays],
  );
  return {
    isFinished,
    /** The open day (useOpenDay). */
    openDay: open.day,
    /** The day a stop added "now" goes on (Pin spot's Add to plan), or null when none is open for me. */
    addDay: addDayFor({
      openDay: open.day,
      calendarDay: open.calendarDay,
      days,
      closedDays: myDays,
    }),
    ready: open.ready && closures.ready,
  };
}
