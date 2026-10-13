/**
 * A demo call's error in plain words, for the screen (Settings, the debug bar). The server's
 * own message is kept when it is clear, so a problem can be told apart from a bad connection.
 */
export function demoReason(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/not a member/i.test(msg)) return "You're not a member of this trip on this account.";
  if (/does not exist|schema cache|could not find the (function|table)/i.test(msg))
    return "Demo mode isn't set up on the server yet (run supabase/migrations/018_shared_demo.sql).";
  if (/network|fetch|timed? ?out|offline/i.test(msg)) return 'Check the connection and try again.';
  return msg ? `${msg}. Try again.` : 'Try again.';
}
