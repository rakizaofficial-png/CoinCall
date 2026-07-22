/** Shared layout constants for Host tab + safe-area padding */
export const TAB_BAR_CONTENT_HEIGHT = 56;
export const TAB_BAR_BASE_PADDING = 10;

/** Absolute tab bar total height including bottom safe inset */
export function tabBarTotalHeight(bottomInset: number) {
  return TAB_BAR_CONTENT_HEIGHT + Math.max(bottomInset, 8) + TAB_BAR_BASE_PADDING;
}

/** Bottom padding so scroll content clears the floating tab bar */
export function tabScreenBottomPad(bottomInset: number) {
  return tabBarTotalHeight(bottomInset) + 16;
}
