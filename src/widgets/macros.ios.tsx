// The "Macros" home-screen and Lock Screen widget on iOS (SwiftUI through Expo UI).
// The layout runs in the widget's own runtime: everything it uses is declared inside it.
import { HStack, ProgressView, Rectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  progressViewStyle,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { EMPTY_MACROS, type MacroWidgetHandle, type MacroWidgetProps } from './types';

const Macros = (props: MacroWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { bg: '#161814', text: '#F2F4EC', text2: '#A9AD9F', kcal: '#5B82F0', protein: '#FF7BAC', fat: '#FFC94D', carbs: '#55C2FF', over: '#FF6359' }
    : { bg: '#FFFFFF', text: '#11130E', text2: '#55594E', kcal: '#4169E1', protein: '#C92F6B', fat: '#9A6400', carbs: '#0B73B0', over: '#CC2E26' };
  // Each bar's track: a pale version of its colour (over the widget's background).
  const pale = dark
    ? { kcal: '#232B45', protein: '#3A2530', fat: '#3A3322', carbs: '#1E3340', over: '#3D2220' }
    : { kcal: '#D3DCF8', protein: '#F3D2DF', fat: '#EFE2C9', carbs: '#CBE1EE', over: '#F4D1CF' };

  // A new day since the app last updated the widget: nothing eaten yet, targets not known.
  const d = environment.date ?? new Date();
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  const todayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fresh = props.date !== todayKey;
  const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const rows = [
    { label: 'KCAL', value: fresh ? 0 : props.kcal, target: fresh ? 0 : props.kcalTarget, color: c.kcal, track: pale.kcal },
    { label: 'PROTEIN', value: fresh ? 0 : props.protein, target: fresh ? 0 : props.proteinTarget, color: c.protein, track: pale.protein },
    { label: 'FAT', value: fresh ? 0 : props.fat, target: fresh ? 0 : props.fatTarget, color: c.fat, track: pale.fat },
    { label: 'CARBS', value: fresh ? 0 : props.carbs, target: fresh ? 0 : props.carbsTarget, color: c.carbs, track: pale.carbs },
  ];
  // A thick rounded bar: 40 equal slices, as many filled as the share of the target reached
  // (a widget can't measure its width, so the fill is made of equal-width pieces instead).
  const SLICES = 40;
  const slices = Array.from({ length: SLICES }, (_, i) => i);

  // Lock Screen: one line of calories, one of macros, in the system's tint.
  if (environment.widgetFamily === 'accessoryRectangular') {
    const k = rows[0];
    return (
      <VStack alignment="leading" spacing={1} modifiers={[containerBackground('clear', 'widget')]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), monospacedDigit()]}>
          {k.target ? `${num(k.value)} / ${num(k.target)}` : '–'} kcal
        </Text>
        <ProgressView value={k.target ? Math.min(1, k.value / k.target) : 0} modifiers={[progressViewStyle('linear')]} />
        <Text modifiers={[font({ size: 12, weight: 'medium' }), monospacedDigit()]}>
          {`P ${num(rows[1].value)} · F ${num(rows[2].value)} · C ${num(rows[3].value)}`}
        </Text>
      </VStack>
    );
  }

  const medium = environment.widgetFamily === 'systemMedium';
  return (
    <VStack alignment="leading" spacing={medium ? 7 : 6} modifiers={[containerBackground(c.bg, 'widget')]}>
      {rows.map((r) => {
        const over = r.target > 0 && r.value > r.target;
        const filled = r.target ? Math.round(Math.min(1, r.value / r.target) * SLICES) : 0;
        return (
          <VStack key={r.label} alignment="leading" spacing={5}>
            <HStack spacing={6}>
              <Text modifiers={[font({ size: medium ? 14 : 12, weight: 'medium' }), foregroundStyle(c.text2), lineLimit(1)]}>
                {r.label}
              </Text>
              <Spacer minLength={2} />
              <Text
                modifiers={[
                  font({ size: medium ? 17 : 15, weight: 'semibold' }),
                  monospacedDigit(),
                  foregroundStyle(over ? c.over : c.text),
                  lineLimit(1),
                  minimumScaleFactor(0.6),
                ]}>
                {r.target ? `${num(r.value)} / ${num(r.target)}` : '– / –'}
              </Text>
            </HStack>
            <HStack spacing={0} modifiers={[frame({ height: medium ? 12 : 11 }), clipShape('capsule')]}>
              {slices.map((i) => (
                <Rectangle
                  key={i}
                  modifiers={[
                    foregroundStyle(i < filled ? (over ? c.over : r.color) : over ? pale.over : r.track),
                    frame({ maxWidth: 1000, maxHeight: 1000 }),
                  ]}
                />
              ))}
            </HStack>
          </VStack>
        );
      })}
    </VStack>
  );
};

const widget = createWidget<MacroWidgetProps>('Macros', Macros, EMPTY_MACROS);

const MacroWidget: MacroWidgetHandle = {
  show(props) {
    // Today's numbers now; at midnight the same props, which the layout shows as a fresh day.
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    widget.updateTimeline([
      { date: new Date(), props },
      { date: midnight, props },
    ]);
  },
};
export default MacroWidget;
