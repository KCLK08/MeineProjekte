import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

import { Panel, SectionTitle, StatusBadge } from '@/components/ui';
import { useAppTheme } from '@/theme/useAppTheme';

export type TimelineStepStatus = 'done' | 'active' | 'pending' | 'failed';

export type TimelineStep = {
  id: string;
  label: string;
  status: TimelineStepStatus;
  detail?: string;
};

function statusMark(status: TimelineStepStatus): string {
  switch (status) {
    case 'done':
      return '✓';
    case 'active':
      return '●';
    case 'failed':
      return '!';
    default:
      return '○';
  }
}

function statusTone(status: TimelineStepStatus): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'done') return 'ok';
  if (status === 'active') return 'warn';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

function statusLabel(status: TimelineStepStatus): string {
  switch (status) {
    case 'done':
      return 'Erledigt';
    case 'active':
      return 'Läuft…';
    case 'failed':
      return 'Fehler';
    default:
      return 'Wartet';
  }
}

function ActivePulseMark() {
  const { colors } = useAppTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        opacity,
        width: 20,
        marginTop: 2,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '700',
        color: colors.pine,
      }}
    >
      ●
    </Animated.Text>
  );
}

/**
 * Product transfer progress list – uses existing Panel / StatusBadge patterns only.
 */
export function TransferTimeline({
  title = 'Übertragung',
  steps,
}: {
  title?: string;
  steps: TimelineStep[];
}) {
  return (
    <View accessibilityRole="summary">
      <SectionTitle>{title}</SectionTitle>
      <Panel className="px-4 py-4">
        {steps.map((step, index) => {
          const a11y = `Schritt ${index + 1}: ${step.label}. Status: ${statusLabel(step.status)}${
            step.detail ? `. ${step.detail}` : ''
          }`;
          return (
            <View
              key={step.id}
              accessible
              accessibilityLabel={a11y}
              accessibilityRole="text"
              className={`flex-row items-start gap-3 ${index < steps.length - 1 ? 'mb-4' : ''}`}
            >
              {step.status === 'active' ? (
                <ActivePulseMark />
              ) : (
                <Text
                  className={`mt-0.5 w-5 text-center font-sansBold text-base ${
                    step.status === 'done'
                      ? 'text-pine-700 dark:text-pine-400'
                      : step.status === 'failed'
                        ? 'text-danger'
                        : 'text-mute dark:text-[#9bb0a6]'
                  }`}
                >
                  {statusMark(step.status)}
                </Text>
              )}
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 font-sansBold text-[15px] text-ink dark:text-[#e7f2ec]">
                    {index + 1}. {step.label}
                  </Text>
                  <StatusBadge label={statusLabel(step.status)} tone={statusTone(step.status)} />
                </View>
                {step.detail ? (
                  <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                    {step.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </Panel>
    </View>
  );
}
