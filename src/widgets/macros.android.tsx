// The "Macros" home-screen widget on Android (Jetpack Compose / Glance through Expo UI).
// The layout runs in the widget's own runtime: everything it uses is declared inside it.
import { Box, Column, LinearProgressIndicator, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { EMPTY_MACROS, type MacroWidgetHandle, type MacroWidgetProps } from './types';

const Macros = (props: MacroWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { bg: '#161814', text: '#F2F4EC', text2: '#A9AD9F', track: '#2C2F29', kcal: '#5B82F0', protein: '#FF7BAC', fat: '#FFC94D', carbs: '#55C2FF', over: '#FF6359' }
    : { bg: '#FFFFFF', text: '#11130E', text2: '#55594E', track: '#E2E4DB', kcal: '#4169E1', protein: '#C92F6B', fat: '#9A6400', carbs: '#0B73B0', over: '#CC2E26' };

  // A new day since the app last updated the widget: nothing eaten yet, targets not known.
  const d = new Date();
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  const todayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fresh = props.date !== todayKey;
  const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const rows = [
    { label: 'KCAL', value: fresh ? 0 : props.kcal, target: fresh ? 0 : props.kcalTarget, color: c.kcal },
    { label: 'PROTEIN', value: fresh ? 0 : props.protein, target: fresh ? 0 : props.proteinTarget, color: c.protein },
    { label: 'FAT', value: fresh ? 0 : props.fat, target: fresh ? 0 : props.fatTarget, color: c.fat },
    { label: 'CARBS', value: fresh ? 0 : props.carbs, target: fresh ? 0 : props.carbsTarget, color: c.carbs },
  ];

  return (
    <Column
      verticalArrangement="spaceEvenly"
      modifiers={[fillMaxSize(), background(c.bg), cornerRadius(22), paddingAll(14)]}>
      {rows.map((r) => {
        const over = r.target > 0 && r.value > r.target;
        return (
          <Column key={r.label} modifiers={[fillMaxWidth()]}>
            {/* Android widgets can't stretch a spacer, so the label and the numbers are two
                full-width rows laid over each other: one aligned left, one right. */}
            <Box modifiers={[fillMaxWidth()]}>
              <Row horizontalAlignment="start" modifiers={[fillMaxWidth()]}>
                <Text color={c.text2} style={{ fontSize: 12, fontWeight: '600' }}>
                  {r.label}
                </Text>
              </Row>
              <Row horizontalAlignment="end" modifiers={[fillMaxWidth()]}>
                <Text color={over ? c.over : c.text} style={{ fontSize: 13, fontWeight: '700' }}>
                  {r.target ? `${num(r.value)} / ${num(r.target)}` : '– / –'}
                </Text>
              </Row>
            </Box>
            <Spacer modifiers={[height(4)]} />
            <LinearProgressIndicator
              progress={r.target ? Math.min(1, r.value / r.target) : 0}
              color={over ? c.over : r.color}
              trackColor={c.track}
              modifiers={[fillMaxWidth(), height(7), cornerRadius(4)]}
            />
          </Column>
        );
      })}
    </Column>
  );
};

const widget = createWidget<MacroWidgetProps>('Macros', Macros, EMPTY_MACROS);

const MacroWidget: MacroWidgetHandle = {
  show(props) {
    widget.updateSnapshot(props);
  },
};
export default MacroWidget;
