import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Line icons drawn on a 24 grid, matching the design boards on iOS and Android. */
export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'plus'
  | 'check'
  | 'camera'
  | 'search'
  | 'clock'
  | 'alert'
  | 'warn'
  | 'info'
  | 'good'
  | 'barcode'
  | 'scale'
  | 'stopwatch'
  | 'file'
  | 'ring'
  | 'list'
  | 'calendar'
  | 'person';

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chevron-left' ? <Path d="M14.5 6l-6 6 6 6" {...p} /> : null}
      {name === 'chevron-right' ? <Path d="M9.5 6l6 6-6 6" {...p} /> : null}
      {name === 'close' ? <Path d="M6 6l12 12M18 6L6 18" {...p} /> : null}
      {name === 'plus' ? <Path d="M12 5v14M5 12h14" {...p} /> : null}
      {name === 'check' ? <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} /> : null}
      {name === 'camera' ? (
        <>
          <Path d="M3.5 8.5h3.2l1.8-2.5h7l1.8 2.5h3.2v10.5h-17z" {...p} />
          <Circle cx={12} cy={13.5} r={3.6} {...p} />
        </>
      ) : null}
      {name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={6.5} {...p} />
          <Path d="M16 16l4.5 4.5" {...p} />
        </>
      ) : null}
      {name === 'clock' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M12 7.5V12l3 2" {...p} />
        </>
      ) : null}
      {name === 'stopwatch' ? (
        <>
          <Circle cx={12} cy={13.5} r={7} {...p} />
          <Path d="M12 13.5V10M10 3.5h4M18 7l1.5-1.5" {...p} />
        </>
      ) : null}
      {name === 'alert' ? (
        <>
          <Path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z" {...p} />
          <Path d="M12 7.5v5.5M12 16.3v.3" {...p} />
        </>
      ) : null}
      {name === 'warn' ? (
        <>
          <Path d="M12 4l9 16H3z" {...p} />
          <Path d="M12 10v4.5M12 17.2v.3" {...p} />
        </>
      ) : null}
      {name === 'info' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 11v5.5M12 7.8v.3" {...p} />
        </>
      ) : null}
      {name === 'good' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M8 12.3l2.8 2.8L16.2 9.6" {...p} />
        </>
      ) : null}
      {name === 'barcode' ? <Path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" {...p} /> : null}
      {name === 'scale' ? (
        <>
          <Rect x={3.5} y={5} width={17} height={14} rx={3} {...p} />
          <Path d="M9 9.5a3 3 0 0 1 6 0M12 9.5l1.2-1.6" {...p} />
        </>
      ) : null}
      {name === 'file' ? (
        <>
          <Path d="M7 3h7l5 5v13H7z" {...p} />
          <Path d="M14 3v5h5" {...p} />
        </>
      ) : null}
      {name === 'ring' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M15.5 8.6a4.8 4.8 0 1 0 0 6.8" {...p} />
        </>
      ) : null}
      {name === 'list' ? (
        <>
          <Rect x={5} y={4} width={14} height={17} rx={2.5} {...p} />
          <Path d="M9 3v2.5h6V3M8.5 11h7M8.5 15h5" {...p} />
        </>
      ) : null}
      {name === 'calendar' ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={3} {...p} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...p} />
        </>
      ) : null}
      {name === 'person' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.8} {...p} />
          <Path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" {...p} />
        </>
      ) : null}
    </Svg>
  );
}
