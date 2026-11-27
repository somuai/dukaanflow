import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors, useReducedMotion } from './ui';

const mascot = require('../assets/parcel-mascot.png');

export function ParcelGuide({ label, prompt, tip }: { label: string; prompt: string; tip: string }) {
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();
  const tilt = useSharedValue(0);
  const motion = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));

  function greet() {
    setRevealed(true);
    if (reduceMotion) return;
    tilt.value = withSequence(
      withTiming(-4, { duration: 80 }),
      withTiming(4, { duration: 90 }),
      withTiming(0, { duration: 110 }),
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={revealed ? label : prompt}
        accessibilityHint={tip}
        testID="parcel-guide"
        onPress={greet}
        hitSlop={8}
        style={styles.pressable}
      >
        <Animated.View style={[styles.art, motion]}>
          <Image source={mascot} resizeMode="contain" accessible={false} style={styles.image} />
        </Animated.View>
      </Pressable>
      <Text style={styles.caption}>{revealed ? tip : prompt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 1, marginBottom: 3 },
  pressable: { minWidth: 76, minHeight: 76, alignItems: 'center', justifyContent: 'center' },
  art: { width: 76, height: 76 },
  image: { width: '100%', height: '100%' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
