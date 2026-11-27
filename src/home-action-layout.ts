export type ActionMenuPoint = { x: number; y: number };

/** Three independent touch targets in an upward fan, with a row layout for large text. */
export function homeActionLayout(anchor: ActionMenuPoint, width: number, topInset: number, fontScale: number) {
  const edge = 16;
  const compact = fontScale >= 1.4 || width < 340 || anchor.y - topInset < 250;
  if (compact) {
    const rowWidth = Math.min(230, width - edge * 2);
    const rowHeight = Math.max(54, Math.ceil(28 * fontScale + 20));
    const x = Math.max(edge + rowWidth / 2, Math.min(anchor.x, width - edge - rowWidth / 2));
    const firstY = Math.max(topInset + rowHeight / 2 + 4, anchor.y - 44 - (rowHeight + 8) * 2 - rowHeight / 2);
    return { compact, width: rowWidth, height: rowHeight, points: [0, 1, 2].map((index) => ({ x, y: firstY + (rowHeight + 8) * index })) };
  }
  const firstX = Math.max(edge + 41, anchor.x - 230);
  return {
    compact, width: 82, height: 90,
    points: [
      { x: firstX, y: anchor.y - 80 },
      { x: firstX + 86, y: anchor.y - 140 },
      { x: firstX + 172, y: anchor.y - 174 },
    ],
  };
}
