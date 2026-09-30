// Design tokens — "sealed letter" system: a private balance is a letter only its owner can open.
// Dark ink page, warm paper-colored ink for text (the cream tone becomes the *writing*, not the
// background), and exactly one reserved accent — sealing wax — kept rare so it still reads as a
// seal, not wallpaper. `colors` is mirrored by hand into `global.css`'s Tailwind `@theme` block
// (Tailwind can't import a TS module) — keep the two in sync when editing either. `fontFamily` is
// NOT mirrored there: each weight of an Expo Google Font is its own distinct native font-family
// name (e.g. "Manrope_600SemiBold"), so it's applied directly via `style={{ fontFamily }}` rather
// than a Tailwind class, which would depend on uniwind supporting a custom `--font-*` theme
// namespace the same way real Tailwind CSS does — not worth the risk on a target with no browser
// devtools to verify against.
export const colors = {
  ink: {
    950: '#0F1116', // app background
    900: '#171A21', // elevated surface (cards, sheets, tab bar)
    800: '#232733', // hairline borders / dividers on dark surfaces
    700: '#2E3341', // pressed / hover surface
  },
  paper: {
    500: '#F6F1E7', // primary text — warm off-white, the "ink" written on the dark page
    400: '#DCD6C8', // slightly muted paper, for secondary display text
  },
  mute: {
    500: '#8C93A6', // secondary text, cool low-saturation grey-blue
    600: '#6B7185', // tertiary / placeholder text
  },
  seal: {
    500: '#C4432E', // the one reserved accent: primary actions, the wax-seal mark
    600: '#A6371F', // pressed state
    400: '#D6604C', // on-dark tints (borders, subtle backgrounds)
  },
  gold: {
    500: '#C9A227', // antique gold — reserved for "unlocked / verified", never on buttons
  },
  success: '#4E9A6B',
  danger: '#C4432E',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const

export const radii = {
  sm: 8,
  md: 14,
  lg: 24,
  pill: 999,
} as const

// Two families, clearly distinct jobs: Fraunces (a warm, soft-terminal serif) carries the brand
// and money — the wordmark and the one large balance figure, like an amount written by hand on a
// letter. Manrope carries everything you scan or tap: labels, buttons, body, navigation.
export const fontFamily = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  ui: 'Manrope_500Medium',
  uiRegular: 'Manrope_400Regular',
  uiSemibold: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
} as const

export const typography = {
  wordmark: { fontFamily: fontFamily.display, fontSize: 22 },
  balance: { fontFamily: fontFamily.display, fontSize: 44, letterSpacing: -0.5 },
  title: { fontFamily: fontFamily.uiSemibold, fontSize: 20 },
  body: { fontFamily: fontFamily.ui, fontSize: 16 },
  label: { fontFamily: fontFamily.uiSemibold, fontSize: 13 },
  caption: { fontFamily: fontFamily.ui, fontSize: 13 },
}
