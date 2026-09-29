// Phase 7 design tokens — the envelope/seal motif: warm paper background, a wax-seal red for
// primary actions, ink navy for text. Mirrored into `global.css`'s `@theme` block so uniwind
// utility classes (`bg-seal-600`, `text-ink-900`, ...) stay in sync with these values; import
// from here instead when React Native needs a raw value (StatusBar color, SVG fill, etc.) rather
// than a className.
export const colors = {
  paper: {
    50: '#FFFDF8',
    100: '#FBF4E4',
    200: '#F3E6C9',
  },
  ink: {
    600: '#5C5344',
    700: '#3D362B',
    900: '#221D15',
  },
  seal: {
    500: '#B8442F',
    600: '#9C3623',
    700: '#7C2A1B',
  },
  gold: {
    400: '#D9A441',
    500: '#C08A2E',
  },
  success: '#3F7A4E',
  danger: '#B8442F',
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
  md: 12,
  lg: 20,
  pill: 999,
} as const

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const },
  title: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
}
