/**
 * Smartisan Notes-inspired design system
 * Warm color palette with elegant typography
 */

export const Colors = {
  light: {
    // Core
    background: '#FAF6F1',        // Warm cream
    surface: '#FFFFFF',           // Card background
    surfaceHover: '#FFF8F2',      // Card hover
    primary: '#E8734A',           // Warm orange accent
    primaryLight: '#FFEEE6',      // Light orange tint
    secondary: '#8B6914',         // Warm gold

    // Text
    text: '#2C1810',
    icon: '#8C7B6B',
    textPrimary: '#2C1810',       // Deep brown
    textSecondary: '#8C7B6B',     // Muted brown
    textTertiary: '#B5A89A',      // Light brown
    textInverse: '#FFFFFF',

    // Functional
    border: '#E8DDD3',            // Warm border
    borderLight: '#F0E8DF',
    divider: '#F0E8DF',
    star: '#F5B731',              // Star gold
    danger: '#D94848',            // Delete red
    dangerLight: '#FDEAEA',
    success: '#4CAF50',
    successLight: '#E8F5E9',

    // Shadows
    shadowColor: 'rgba(44, 24, 16, 0.08)',
    shadowColorStrong: 'rgba(44, 24, 16, 0.15)',

    // Overlay
    overlay: 'rgba(44, 24, 16, 0.3)',

    // Status bar
    statusBar: 'dark-content' as const,
  },
  dark: {
    background: '#1A1412',
    surface: '#2A221E',
    surfaceHover: '#352B25',
    primary: '#E8734A',
    primaryLight: '#3D2418',
    secondary: '#D4A84B',

    textPrimary: '#F0E8DF',
    text: '#F0E8DF',
    icon: '#9C8B7D',
    textSecondary: '#9C8B7D',
    textTertiary: '#6B5D52',
    textInverse: '#1A1412',

    border: '#3D332B',
    borderLight: '#332A24',
    divider: '#332A24',
    star: '#F5B731',
    danger: '#E86060',
    dangerLight: '#3D1A1A',
    success: '#66BB6A',
    successLight: '#1A3D1A',

    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowColorStrong: 'rgba(0, 0, 0, 0.5)',

    overlay: 'rgba(0, 0, 0, 0.5)',

    statusBar: 'light-content' as const,
  },
};

export const Typography = {
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  button: {
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
    lineHeight: 20,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const Shadows = {
  card: {
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  cardHover: {
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  fab: {
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
};
