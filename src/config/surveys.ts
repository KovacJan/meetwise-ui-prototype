/**
 * How many days back a team member can respond to a post-meeting survey.
 * Affects both the cron job and the in-app surveys page.
 */
export const SURVEY_WINDOW_DAYS = 7;

/**
 * How often (in minutes) the poll batch email job runs.
 *
 * IMPORTANT: This value must stay in sync with the cron schedule in vercel.json.
 * When you change this, also update the corresponding cron expression.
 */
export const POLL_BATCH_INTERVAL_MINUTES = 60;

/**
 * Minimum age (in minutes) a meeting must have ended before we include it in
 * a batch email. This gives a small grace period so participants have actually
 * left the meeting before the email arrives.
 */
export const POLL_MIN_AGE_MINUTES = 5;
