import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Platform, RefreshControl, Switch, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { CRing } from '@/components/c-ring';
import { DayTypePicker } from '@/components/day-type-picker';
import { FastingBar } from '@/components/fasting-card';
import { MacroBars, TargetLedger, WeekStrip } from '@/components/hero';
import { InsightsCard } from '@/components/insights-card';
import { MealCard } from '@/components/meal-card';
import { showMenu } from '@/components/menu';
import { QuickDock } from '@/components/quick-dock';
import { Skeleton } from '@/components/skeleton';
import { TabHeader } from '@/components/tab-header';
import { AddSlot, DotNote, Sparkline, Tile, TileValue } from '@/components/tiles';
import { Button, Card, Divider, ErrorText, fmt, Num, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { computeWeek, loadWeek, type WeekData, type WeekView } from '@/lib/adaptive';
import { planDay } from '@/lib/day-plan';
import { listPlanItems, logPlanItem, type PlanItem } from '@/lib/plans';
import { isProfileComplete, setDiaryDay, type Profile, type TrainingSession } from '@/lib/api';
import { addDays, formatDay, formatLongDay, isValidISODate, startOfWeek, today } from '@/lib/dates';
import { parseClock } from '@/lib/fasting';
import { defaultSlotForNow, resolveSlots, slotsForData } from '@/lib/meals';
import { sumTotals } from '@/lib/nutrition';
import { sessionKcalDetail, sessionLabel } from '@/lib/targets';
import { WEEK_INSIGHT_IDS, weekSummary } from '@/lib/week-summary';

/** Clears the floating dock and the tab bar. */
const BOTTOM_PAD = 200;

export default function TodayScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(() =>
    params.date && isValidISODate(params.date) ? params.date : today(),
  );

  // The Week screen links here with ?date=...; follow it when it changes.
  const [linkedDate, setLinkedDate] = useState(params.date);
  if (params.date !== linkedDate) {
    setLinkedDate(params.date);
    if (params.date && isValidISODate(params.date)) setDate(params.date);
  }

  const { data, error, reload, refreshing, refresh } = useAsync(async () => {
    const [week, plan] = await Promise.all([loadWeek(date), listPlanItems(date).catch(() => [] as PlanItem[])]);
    return { ...week, plan };
  }, date);
  const isToday = date === today();

  // Data from a different week is stale for this day: show the skeleton until it arrives.
  const fresh = data && data.weekStart === startOfWeek(date) ? data : undefined;
  const profile = fresh?.profile;
  const slots = resolveSlots(profile?.meal_slots);
  const windowStart = parseClock(profile?.eating_window_start);
  const windowEnd = parseClock(profile?.eating_window_end);
  const fastingWindow =
    windowStart != null && windowEnd != null ? { startMin: windowStart, endMin: windowEnd } : null;
  const defaultMeal = isToday ? defaultSlotForNow(slots, new Date(), fastingWindow) : slots[slots.length - 1].key;

  const diaryDay = !!fresh?.diaryDays.includes(date);

  // The quick bar slides away while scrolling down; it comes back on scrolling up, near the top, or after a pause.
  const [dockHidden, setDockHidden] = useState(false);
  const lastY = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (idle.current) clearTimeout(idle.current);
  }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < 40 || dy < -6) setDockHidden(false);
    else if (dy > 6) setDockHidden(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setDockHidden(false), 1500);
  };

  const header = (
    <TabHeader
      sub={formatLongDay(date)}
      title={isToday ? 'Today' : formatDay(date)}
      onPrev={() => setDate(addDays(date, -1))}
      onNext={() => setDate(addDays(date, 1))}
      nextDim={isToday}
      back={isToday ? null : { label: 'Back to today', onPress: () => setDate(today()) }}
    />
  );

  const dock = (
    <QuickDock
      hidden={dockHidden}
      onScan={() => router.push({ pathname: '/scan', params: { date, meal: defaultMeal } })}
      onAddFood={() =>
        router.push({ pathname: '/food', params: { date, meal: defaultMeal, ...(diaryDay ? { diary: '1' } : {}) } })
      }
      onLogSession={() => router.push({ pathname: '/training', params: { date } })}
      onWeighIn={() => router.push('/weigh-in')}
      onLogDay={() => router.push({ pathname: '/log-day', params: { date } })}
    />
  );

  if (!fresh || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Screen padBottom={BOTTOM_PAD}>
          {header}
          {error ? (
            <>
              <ErrorText message={error} />
              <Button title="Try again" variant="secondary" onPress={reload} style={{ alignSelf: 'flex-start' }} />
            </>
          ) : (
            <TodaySkeleton />
          )}
        </Screen>
        {dock}
      </View>
    );
  }

  const view = computeWeek(fresh, today());
  const day = view?.days[date];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen
        padBottom={BOTTOM_PAD}
        onScroll={onScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {header}
        <ErrorText message={error} />

        {!isProfileComplete(profile) || !view || !day ? (
          <Card hero>
            <T variant="headline">Set up your profile</T>
            <T variant="footnote">Add your sex, birth date, height and weight so we can work out your daily targets.</T>
            <Button title="Go to profile" onPress={() => router.navigate('/profile')} />
          </Card>
        ) : (
          <TodayBody key={date} data={fresh} view={view} date={date} isToday={isToday} slots={slots} fastingWindow={fastingWindow} onChanged={reload} />
        )}
      </Screen>
      {dock}
    </View>
  );
}

function TodayBody({
  data,
  view,
  date,
  isToday,
  slots,
  fastingWindow,
  onChanged,
}: {
  data: WeekData & { plan: PlanItem[] };
  view: WeekView;
  date: string;
  isToday: boolean;
  slots: ReturnType<typeof resolveSlots>;
  fastingWindow: { startMin: number; endMin: number } | null;
  onChanged: () => void;
}) {
  const c = useTheme();
  const { profile } = data;
  const day = view.days[date];
  const sessions = data.sessions.filter((s) => s.date === date);
  const food = data.food.filter((f) => f.date === date);
  const eaten = sumTotals(food);
  const target = day.adjusted;
  const [diaryOverride, setDiaryOverride] = useState<boolean | null>(null);
  const diary = diaryOverride ?? view.diary.has(date);
  const closedUnder = !diary && date < today() && food.length > 0 && eaten.kcal < target;

  async function toggleDiary(on: boolean) {
    setDiaryOverride(on);
    try {
      await setDiaryDay(date, on);
      onChanged();
    } catch (e) {
      setDiaryOverride(null);
      Alert.alert('Couldn’t change that', e instanceof Error ? e.message : String(e));
    }
  }
  const trainingLabel =
    sessions.length === 1 ? sessionLabel(sessions[0]).toLowerCase() : sessions.length > 1 ? 'training' : 'rest day';
  const insights = view.insights.filter((i) => !WEEK_INSIGHT_IDS.includes(i.id));

  // The plan for the day: what's still to eat, sized so the day lands on target.
  const dayPlan = planDay(data.plan, food, { kcal: target, protein_g: day.proteinG, carbs_g: day.carbsG, fat_g: day.fatG });
  const plannedFor = (meal: string) =>
    data.plan.filter((i) => i.meal === meal && !dayPlan.isLogged(i)).map((item) => ({ item, grams: dayPlan.gramsFor(item) }));

  async function logPlanned(item: PlanItem, grams: number) {
    try {
      await logPlanItem(item, grams);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onChanged();
    } catch (e) {
      Alert.alert('Couldn’t log that', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <DayTypePicker date={date} dayTypes={data.dayTypes} selectedId={data.assignments[date]} onChanged={onChanged} />
      {/* Hero: today and the week in one card */}
      <Card hero style={{ alignItems: 'center', gap: Spacing.md, paddingBottom: 14 }}>
        <CRing
          eaten={eaten.kcal}
          target={target}
          training={day.raw.training}
          closedUnder={closedUnder}
          note={diary ? 'Diary only · not counted' : undefined}
        />
        <TargetLedger
          baseLabel={day.raw.dayType ?? 'base'}
          dayType={!!day.raw.dayType}
          base={day.raw.base}
          training={day.raw.training}
          trainingLabel={trainingLabel}
          weekBalance={day.adjustment}
          target={target}
        />
        <View style={{ alignSelf: 'stretch' }}>
          <Divider />
        </View>
        <MacroBars
          macros={[
            { label: 'Protein', value: eaten.proteinG, target: day.proteinG, color: c.protein },
            { label: 'Carbs', value: eaten.carbsG, target: day.carbsG, color: c.carbs },
            { label: 'Fat', value: eaten.fatG, target: day.fatG, color: c.fat },
          ]}
        />
        <View style={{ alignSelf: 'stretch' }}>
          <Divider />
        </View>
        <WeekStrip days={view.week.days} viewedDate={date} summary={weekSummary(view.week)} />
        {day.raw.flooredAtBmr ? (
          <T variant="footnote" style={{ alignSelf: 'stretch' }}>
            Your goal deficit was capped so the base target doesn’t drop below your BMR ({fmt(day.raw.bmr)}).
          </T>
        ) : null}
      </Card>

      {isToday ? <InsightsCard insights={insights} /> : null}

      {isToday && fastingWindow ? <FastingBar {...fastingWindow} /> : null}

      <Row gap={Spacing.md} style={{ alignItems: 'stretch' }}>
        <TrainingTile profile={profile} sessions={sessions} date={date} isToday={isToday} view={view} />
        <WeightTile view={view} date={date} isToday={isToday} />
      </Row>

      <Card style={{ gap: 2, paddingVertical: 12 }}>
        <Row style={{ justifyContent: 'space-between', minHeight: 36 }}>
          <T style={{ fontWeight: '600' }}>Diary only</T>
          <Switch
            value={diary}
            onValueChange={toggleDiary}
            trackColor={{ true: c.switchOn, false: c.track }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Diary only for this day"
          />
        </Row>
        <T variant="footnote">
          {diary
            ? 'Log food for the record, with or without calories. This day is left out of your week balance and burn estimate.'
            : 'Not tracking properly today? Turn this on and the day won’t skew your week or your burn estimate.'}
        </T>
      </Card>

      <Row style={{ justifyContent: 'space-between', alignItems: 'baseline', paddingTop: Spacing.md, paddingHorizontal: 4 }}>
        <T variant="title" style={{ fontSize: 20, lineHeight: 25 }}>
          Meals
        </T>
        <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
          {fmt(eaten.kcal)} kcal eaten
        </T>
      </Row>
      {slotsForData(slots, [...food.map((f) => f.meal), ...data.plan.map((i) => i.meal)]).map(({ key, label }) => (
        <MealCard
          key={key}
          label={label}
          meal={key}
          date={date}
          items={food.filter((f) => f.meal === key)}
          planned={plannedFor(key)}
          onLogPlanned={logPlanned}
          slots={slots}
          diary={diary}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

function TrainingTile({
  profile,
  sessions,
  date,
  isToday,
  view,
}: {
  profile: Profile;
  sessions: TrainingSession[];
  date: string;
  isToday: boolean;
  view: WeekView;
}) {
  const c = useTheme();
  const add = () => router.push({ pathname: '/training', params: { date } });
  const open = (s: TrainingSession) => router.push({ pathname: '/training', params: { id: s.id, date } });

  if (sessions.length === 0) {
    const title = isToday ? 'Rest day' : date > today() ? 'Nothing planned' : 'No session logged';
    return (
      <Tile overline="Training" overlineColor={c.training} onPress={add} accessibilityLabel={`${title}. Add a session`}>
        <T style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{title}</T>
        <T variant="footnote">{isToday ? 'Nothing planned today' : formatDay(date)}</T>
        <AddSlot label="+ Session" />
      </Tile>
    );
  }

  const details = sessions.map((s) => ({ s, burn: sessionKcalDetail(profile, s, view.rates) }));
  const net = details.reduce((sum, d) => sum + (d.burn?.net ?? 0), 0);
  const allConfirmed = details.every((d) => d.burn?.source === 'actual');
  const first = sessions[0];
  const title =
    sessions.length === 1
      ? `${sessionLabel(first)} · ${first.actual_duration_min ?? first.duration_min}′`
      : `${sessions.length} sessions`;
  const canConfirm = date <= today();
  const fromHistory = details.some((d) => d.burn?.source === 'history');
  const note = allConfirmed
    ? { label: '✓ WHOOP confirmed', color: c.good }
    : canConfirm
      ? { label: 'Estimate · tap to confirm', color: c.info }
      : { label: fromHistory ? 'Estimate from your WHOOP history' : 'Estimate', color: c.text3 };

  const onPress =
    sessions.length === 1
      ? () => open(first)
      : () =>
          showMenu(
            [...sessions.map((s) => ({ label: sessionLabel(s), onPress: () => open(s) })), { label: 'Add a session', onPress: add }],
            'Training',
          );

  return (
    <Tile
      overline="Training"
      overlineColor={c.training}
      onPress={onPress}
      accessibilityLabel={`${title}, ${allConfirmed ? '' : 'about '}${fmt(net)} kcal. ${note.label}`}>
      <T style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }} numberOfLines={1}>
        {title}
      </T>
      <Num size="m" color={c.training} style={{ fontSize: 24, lineHeight: 28 }}>
        {allConfirmed ? '' : '≈ '}+{fmt(net)}
      </Num>
      <DotNote label={note.label} color={note.color} />
    </Tile>
  );
}

function WeightTile({ view, date, isToday }: { view: WeekView; date: string; isToday: boolean }) {
  const c = useTheme();
  const trend = view.trend.filter((p) => p.date <= date);
  const latest = trend.at(-1);
  const loggedThatDay = latest?.date === date;
  const paceColor =
    view.pace === 'on-track' ? c.good : view.pace === 'wrong-direction' ? c.alert : view.pace === 'not-enough-data' ? c.text2 : c.warn;

  let note: { label: string; color: string };
  if (loggedThatDay) note = { label: isToday ? 'Logged ✓ today' : 'Logged ✓ that morning', color: c.good };
  else if (isToday && view.rate != null)
    note = { label: `${view.rate < 0 ? '−' : '+'}${Math.abs(view.rate).toFixed(2)} kg/wk`, color: paceColor };
  else if (isToday) note = { label: 'Not logged today', color: c.info };
  else note = { label: 'Not logged that day', color: c.text2 };

  return (
    <Tile
      overline="Weight"
      onPress={() => router.push('/weigh-in')}
      accessibilityLabel={latest ? `Weight, ${latest.trend.toFixed(1)} kg. ${note.label}. Log weight` : 'Weight. Log your first weigh-in'}>
      {latest ? (
        <>
          <TileValue value={latest.trend.toFixed(1)} unit="kg" />
          <T variant="footnote" color={note.color} style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {note.label}
          </T>
          <Sparkline values={trend.slice(-14).map((p) => p.trend)} />
        </>
      ) : (
        <>
          <T style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>No weigh-ins yet</T>
          <T variant="footnote">See whether the plan is working</T>
          <AddSlot label="+ Weigh in" />
        </>
      )}
    </Tile>
  );
}

function TodaySkeleton() {
  return (
    <>
      <Card hero style={{ alignItems: 'center', gap: Spacing.md, paddingBottom: 14 }} >
        <Skeleton width={208} height={208} radius={104} />
        <Row gap={Spacing.md} style={{ alignSelf: 'stretch' }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={34} style={{ flex: 1 }} width={undefined} />
          ))}
        </Row>
        <Row gap={14} style={{ alignSelf: 'stretch' }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={40} style={{ flex: 1 }} width={undefined} />
          ))}
        </Row>
        <Skeleton height={62} radius={10} />
      </Card>
      <Card hero style={{ gap: 14 }}>
        <Skeleton width={96} height={14} radius={7} />
        <Row gap={Spacing.md}>
          <Skeleton width={32} height={32} radius={16} />
          <Skeleton height={14} radius={7} style={{ flex: 1 }} width={undefined} />
        </Row>
        <Row gap={Spacing.md}>
          <Skeleton width={32} height={32} radius={16} />
          <Skeleton width="60%" height={14} radius={7} />
        </Row>
      </Card>
    </>
  );
}
