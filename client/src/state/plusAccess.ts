/**
 * ArcTV Plus is in early access: its features (the Plus tab, "Picked for you" and Like / Not for me) are on for everyone and labelled as Plus
 * features, free for now. There is no subscription status to read yet; when subscriptions launch, `hasPlus` is the one place to change: make it
 * read the account's status and set `PLUS_EARLY_ACCESS` to false.
 */
export const PLUS_EARLY_ACCESS = true;

/** Does this person have ArcTV Plus? (Everyone does while it is in early access.) */
export const useHasPlus = (): boolean => PLUS_EARLY_ACCESS;
export const hasPlusNow = (): boolean => PLUS_EARLY_ACCESS;
