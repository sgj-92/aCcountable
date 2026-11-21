import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/** The open C on a rounded tile, as on the app icon (180 grid). */
export function BrandMark({ size = 76 }: { size?: number }) {
  const c = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 180 180" accessibilityLabel="aCcountable">
      <Rect width={180} height={180} rx={40} fill={c.surface} />
      <Path
        d="M126.8 53.2A52 52 0 1 0 126.8 126.8"
        fill="none"
        stroke={c.accentLine}
        strokeWidth={size < 48 ? 32 : 28}
        strokeLinecap="round"
      />
    </Svg>
  );
}
