import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font } from '../../theme/fonts';
import { radii, spacing, typography } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';

type TabOption<T extends string> = { key: T; label: string };
type FilterOption<T extends string> = { key: T; label: string };

export function HistoryScreenHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
        <ChevronLeft size={22} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.sub, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function HistoryTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tabs, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.tab, on && { backgroundColor: colors.primary }]}
          >
            <Text
              style={{
                color: on ? '#fff' : colors.textSecondary,
                fontFamily: font.semi,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HistoryFilters<T extends string>({
  options,
  value,
  onChange,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.filters}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor: on ? `${colors.accent}22` : colors.bgCard,
                borderColor: on ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: on ? colors.accent : colors.textMuted,
                fontFamily: font.semi,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HistoryPager({
  page,
  pageCount,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { colors } = useTheme();
  if (pageCount <= 1) return null;
  return (
    <View style={styles.pager}>
      <Pressable
        onPress={onPrev}
        disabled={page <= 1}
        style={[
          styles.pageBtn,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            opacity: page <= 1 ? 0.4 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.text, fontFamily: font.semi }}>Prev</Text>
      </Pressable>
      <Text style={{ color: colors.textMuted, fontFamily: font.medium, fontSize: 13 }}>
        Page {page} / {pageCount}
      </Text>
      <Pressable
        onPress={onNext}
        disabled={page >= pageCount}
        style={[
          styles.pageBtn,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.border,
            opacity: page >= pageCount ? 0.4 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.text, fontFamily: font.semi }}>Next</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  back: { padding: 4 },
  title: { ...typography.title, fontSize: 22 },
  sub: { ...typography.caption, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 4,
    gap: 4,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 42,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: 12,
  },
  pageBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
  },
});
