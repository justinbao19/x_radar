/**
 * Repo-local FiloMail context for X Radar planning and triage.
 * This intentionally lives inside X Radar so GitHub Actions can access it
 * without depending on a local workspace path.
 */

export const FILOMAIL_OPPORTUNITY_BRIEF = `
FiloMail is an AI-native email client.

Core value:
- Email in, action out.
- The product is strongest when the user pain is not "I have email" but "my inbox is where follow-ups, tasks, approvals, and important information get lost."

What counts as high-value X opportunities:
- Real people describing inbox chaos, email overload, missed follow-up, buried important emails, or triage failure
- Clear desire for better email workflow automation
- Requests for AI help that is email-native: summarization, task extraction, follow-up reminders, inbox triage, smart prioritization
- Competitor displacement moments: users explicitly frustrated with Superhuman, Spark, Gmail, Outlook, or similar inbox products
- Positive public product sentiment about FiloMail itself

What does NOT count as a good opportunity:
- Ads, promotions, event announcements, generic newsletters, tool tutorials
- Customer support complaints where FiloMail has no natural relevance
- Account problems, verification codes, delivery notices, spam-folder one-offs without broader workflow pain
- Generic "AI agents are cool" discussion with no email or inbox workflow angle
- Generic productivity hot takes with no clear email, inbox, task extraction, or follow-up context

Public reply threshold:
- High. Prefer zero opportunities over weak opportunities.
- A tweet should only be reply_now if a FiloMail reply would feel natural, useful, and non-forced.
`;

export const TRIAGE_DECISION_GUIDE = `
Decide one of:
- reply_now: natural public reply opportunity for FiloMail right now
- watch_only: relevant market signal worth observing, but not worth replying to now
- discard: noisy, low-value, or not a real FiloMail opportunity
`;

export const QUERY_PLANNER_GUIDE = `
High-precision query planner rules:
- Prefer fewer, narrower queries
- Queries must target intent, not broad topic mention
- Avoid queries that only mention email, inbox, or Gmail without pain/action semantics
- Prioritize workflow friction, inbox triage failure, missed follow-up, task extraction, and competitor displacement
- It is acceptable for a batch to produce zero usable results
`;
