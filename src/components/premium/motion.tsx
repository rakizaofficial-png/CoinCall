import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export function FadeInView({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(280)} style={style}>
      {children}
    </Animated.View>
  );
}

export function SlideUpView({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).springify().damping(18)} style={style}>
      {children}
    </Animated.View>
  );
}

export function SlideDownView({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)} style={style}>
      {children}
    </Animated.View>
  );
}

export function PressableScale({
  children,
  style,
  ...rest
}: PressableProps & { children: ReactNode }) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        scale.value = withSpring(0.96, { damping: 14, stiffness: 320 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 320 });
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}
