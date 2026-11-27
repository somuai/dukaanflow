/** Keep unsaved Home transcripts separate by shop for the life of the Home screen. */
export function updateHomeNoteDraft(
  drafts: Map<string, string>,
  shopId: string,
  text: string,
  submittedText?: string,
): Map<string, string> {
  const current = drafts.get(shopId) ?? '';
  if (current === text || (submittedText !== undefined && submittedText !== current)) return drafts;
  const next = new Map(drafts);
  if (text) next.set(shopId, text);
  else next.delete(shopId);
  return next;
}
