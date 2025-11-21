import { Platform } from 'react-native';

export const typography = {
  fontFamily: {
    regular: Platform.OS === 'ios' ? 'System' : 'Roboto',
    mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  size: {
    xs: 12,
    s: 14,
    m: 16,
    l: 20,
    xl: 24,
    xxl: 32,
  },
  weight: {
    regular: '400' as '400',
    medium: '500' as '500',
    bold: '700' as '700',
  }
};

