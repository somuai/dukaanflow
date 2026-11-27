import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type TextInputProps,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { selectionAsync } from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

export const colors = {
  paper: '#F6F5F1',
  sheet: '#FFFEFA',
  ink: '#191917',
  muted: '#575550',
  line: '#DEDBD3',
  outline: '#918B81',
  charcoal: '#191816',
  orange: '#FA7144',
  orangePressed: '#E95E33',
  buttonInk: '#23150E',
  action: '#982F14',
  warning: '#FFF0E7',
  green: '#245342',
  mint: '#E5EEE5',
  red: '#95271B',
};

const icons = {
  back: require('../assets/icon-back.png'),
  box: require('../assets/icon-box.png'),
  camera: require('../assets/icon-camera.png'),
  check: require('../assets/icon-check.png'),
  globe: require('../assets/icon-globe.png'),
  keyboard: require('../assets/icon-keyboard.png'),
  next: require('../assets/icon-next.png'),
  notes: require('../assets/icon-notes.png'),
  plus: require('../assets/icon-plus.png'),
  search: require('../assets/icon-search.png'),
  settings: require('../assets/icon-settings.png'),
  warning: require('../assets/icon-warning.png'),
} satisfies Record<string, ImageSourcePropType>;

type IconName = keyof typeof icons;
const systemIcons = {
  back: 'chevron.left',
  box: 'shippingbox',
  camera: 'camera',
  check: 'checkmark',
  globe: 'globe',
  keyboard: 'keyboard',
  next: 'chevron.right',
  notes: 'doc.text',
  plus: 'plus',
  search: 'magnifyingglass',
  settings: 'gearshape',
  warning: 'exclamationmark.triangle',
} as const;

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={systemIcons[name]}
        tintColor={color}
        weight={name === 'back' || name === 'next' ? 'semibold' : 'regular'}
        size={size}
        style={{ width: size, height: size }}
        accessible={false}
        importantForAccessibility="no"
      />
    );
  }
  return (
    <Image
      accessible={false}
      importantForAccessibility="no"
      resizeMode="contain"
      source={icons[name]}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}

export function useReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

const mark = require('../assets/dukaanflow-mark.png');
const markLayers = [
  require('../assets/dukaanflow-mark-1.png'),
  require('../assets/dukaanflow-mark-2.png'),
  require('../assets/dukaanflow-mark-3.png'),
];

export function Brand({ dark = false, spinMark = false }: { dark?: boolean; spinMark?: boolean }) {
  const reduceMotion = useReducedMotion();
  const segment0 = useSharedValue(1);
  const segment1 = useSharedValue(1);
  const segment2 = useSharedValue(1);
  const word = useSharedValue(1);
  const markRotation = useSharedValue(0);
  const markMotion = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${markRotation.value}deg` }] }));
  const segmentStyle0 = useAnimatedStyle(() => ({ opacity: segment0.value, transform: [{ translateX: -7 * (1 - segment0.value) }] }));
  const segmentStyle1 = useAnimatedStyle(() => ({ opacity: segment1.value, transform: [{ translateX: -7 * (1 - segment1.value) }] }));
  const segmentStyle2 = useAnimatedStyle(() => ({ opacity: segment2.value, transform: [{ translateX: -7 * (1 - segment2.value) }] }));
  const segmentStyles = [segmentStyle0, segmentStyle1, segmentStyle2];
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.value }));

  useEffect(() => {
    if (!dark || reduceMotion) {
      for (const value of [segment0, segment1, segment2, word]) value.value = 1;
      return;
    }
    for (const value of [segment0, segment1, segment2, word]) value.value = 0;
    [segment0, segment1, segment2].forEach((value, index) => {
      value.value = withDelay(index * 48, withTiming(1, { duration: 250, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
    });
    word.value = withDelay(100, withTiming(1, { duration: 250, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
  }, [dark, reduceMotion, segment0, segment1, segment2, word]);

  useEffect(() => {
    if (!spinMark || reduceMotion) {
      markRotation.value = 0;
      return;
    }
    markRotation.value = 0;
    markRotation.value = withTiming(360, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [markRotation, reduceMotion, spinMark]);

  return (
    <View style={styles.brand} accessible accessibilityLabel="DukaanFlow">
      {dark ? (
        <Reanimated.View style={[{ width: 27, height: 27 }, spinMark && markMotion]}>
          {[segment0, segment1, segment2].map((_, index) => (
            <Reanimated.Image
              key={index}
              accessible={false}
              source={markLayers[index]}
              style={[{
                position: 'absolute',
                width: 27,
                height: 27,
              }, segmentStyles[index]]}
            />
          ))}
        </Reanimated.View>
      ) : (
        <Image accessible={false} source={mark} style={{ width: 27, height: 27 }} />
      )}
      <Reanimated.Text style={[styles.brandText, dark && { color: colors.sheet }, dark && wordStyle]}>DukaanFlow</Reanimated.Text>
    </View>
  );
}

type ActionProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  icon?: IconName;
  kind?: 'primary' | 'outline' | 'text' | 'lightText' | 'destructive';
};

export function Action({ title, onPress, disabled, testID, icon, kind = 'primary' }: ActionProps) {
  const [focused, setFocused] = useState(false);
  const ink = kind === 'primary' ? colors.buttonInk
    : kind === 'lightText' ? colors.sheet
      : kind === 'destructive' ? colors.red
        : kind === 'outline' ? colors.ink : colors.action;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.action,
        kind === 'primary' && { backgroundColor: pressed ? colors.orangePressed : colors.orange },
        kind === 'outline' && { borderColor: colors.outline, borderWidth: 1 },
        (kind === 'text' || kind === 'lightText') && styles.textAction,
        pressed && kind !== 'primary' && { opacity: 0.65 },
        disabled && kind !== 'text' && { backgroundColor: '#E8E6E1' },
        focused && { borderColor: kind === 'lightText' ? colors.sheet : colors.action, borderWidth: 2 },
      ]}
    >
      {icon && <Icon name={icon} size={18} color={disabled ? colors.muted : ink} />}
      <Text style={[styles.actionTitle, { color: disabled ? colors.muted : ink }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, filled, testID }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, filled && { backgroundColor: '#EEECE7' }, pressed && { opacity: 0.55 }]}
    >
      <Icon name={icon} size={22} />
    </Pressable>
  );
}

export function Nav({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return <View style={styles.nav}><View style={styles.navSide}>{left}</View>{right}</View>;
}

export function Screen({ children, footer, nav, dark, avoid = true }: {
  children: ReactNode;
  footer?: ReactNode;
  nav?: ReactNode;
  dark?: boolean;
  avoid?: boolean;
}) {
  return (
    <SafeAreaView style={[styles.screen, dark && { backgroundColor: colors.charcoal }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        enabled={avoid && Platform.OS === 'ios'}
        behavior="padding"
      >
        {nav}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.section}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function Input({ label, multiline, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#716D66"
        selectionColor={colors.action}
        multiline={multiline}
        {...props}
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.inputFocused,
          props.style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
      />
    </View>
  );
}

export function Row({ title, subtitle, value, onPress, selected, border = true, testID, destructive }: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  selected?: boolean;
  border?: boolean;
  testID?: string;
  destructive?: boolean;
}) {
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && { color: colors.red }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {selected !== undefined
        ? selected ? <Icon name="check" color={colors.action} size={18} /> : <View style={{ width: 18 }} />
        : onPress && !destructive ? <Icon name="next" color={colors.muted} size={17} /> : null}
    </>
  );
  const rowStyle = [styles.row, border && styles.rowBorder];
  return onPress ? (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      onPress={() => {
        if (selected === false) void selectionAsync().catch(() => {});
        onPress();
      }}
      testID={testID}
      style={({ pressed }) => [...rowStyle, pressed && { backgroundColor: '#EEECE7' }]}
    >
      {content}
    </Pressable>
  ) : <View style={rowStyle} testID={testID}>{content}</View>;
}

export function Warning({ children, onPress, testID }: { children: ReactNode; onPress?: () => void; testID?: string }) {
  const content = (
    <>
      <Icon name="warning" size={17} color={colors.action} />
      <Text style={styles.warningText}>{children}</Text>
      {onPress ? <Icon name="next" size={16} color={colors.action} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.warning, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  ) : <View style={styles.warning} accessibilityLiveRegion="polite">{content}</View>;
}

export function Banner({ title, actionTitle, onAction, motion = false }: {
  title: string;
  actionTitle?: string;
  onAction?: () => void;
  motion?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <Reanimated.View entering={motion && !reduceMotion ? FadeInDown.duration(160).easing(Easing.bezier(0.16, 1, 0.3, 1)) : undefined} style={styles.banner}>
      {motion ? <SavedReceiptMark reduceMotion={reduceMotion} /> : <Icon name="check" color={colors.green} size={18} />}
      <Text accessibilityLiveRegion="polite" style={styles.bannerText}>{title}</Text>
      {actionTitle && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.bannerAction}
          testID="undo-receipt"
        >
          <Text style={styles.bannerActionText}>{actionTitle}</Text>
        </Pressable>
      ) : null}
    </Reanimated.View>
  );
}

function SavedReceiptMark({ reduceMotion }: { reduceMotion: boolean }) {
  const receiptY = useSharedValue(reduceMotion ? 0 : -7);
  const badgeOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const badgeScale = useSharedValue(reduceMotion ? 1 : 0.96);
  const checkOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      receiptY.value = 0;
      badgeOpacity.value = 1;
      badgeScale.value = 1;
      checkOpacity.value = 1;
      return;
    }
    receiptY.value = -7;
    badgeOpacity.value = 0;
    badgeScale.value = 0.96;
    checkOpacity.value = 0;
    receiptY.value = withTiming(0, { duration: 280, easing: Easing.bezier(0, 0, 0.58, 1) });
    badgeOpacity.value = withDelay(110, withTiming(1, { duration: 180, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
    badgeScale.value = withDelay(110, withTiming(1, { duration: 180, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
    checkOpacity.value = withDelay(150, withTiming(1, { duration: 140, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
  }, [badgeOpacity, badgeScale, checkOpacity, receiptY, reduceMotion]);

  const receiptStyle = useAnimatedStyle(() => ({ transform: [{ translateY: receiptY.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badgeOpacity.value, transform: [{ scale: badgeScale.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: checkOpacity.value }));

  return (
    <View accessible={false} style={styles.savedMark}>
      <Reanimated.View style={[styles.savedPaper, receiptStyle]}>
        <View style={[styles.savedRule, { width: 14 }]} />
        <View style={[styles.savedRule, { width: 16 }]} />
        <View style={[styles.savedRule, { width: 12 }]} />
      </Reanimated.View>
      <Reanimated.View style={[styles.savedBadge, badgeStyle]}>
        <Reanimated.View style={[styles.savedCheckShort, checkStyle]} />
        <Reanimated.View style={[styles.savedCheckLong, checkStyle]} />
      </Reanimated.View>
    </View>
  );
}

export function Sheet({ children, title, subtitle, cancel, close }: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  cancel: string;
  close: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
      <View style={styles.sheetHost}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
        <View accessibilityViewIsModal style={[styles.sheet, {
          maxHeight: height - insets.top - 10,
          paddingBottom: Math.max(insets.bottom, 16),
        }]}>
          <View style={styles.grabber} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} style={fontScale > 1.5 && { flexGrow: 1 }}>
            <View style={styles.sheetNav}>
              <Action title={cancel} kind="text" onPress={close} />
            </View>
            <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
            {subtitle ? <Hint>{subtitle}</Hint> : null}
            <View style={styles.sheetContent}>{children}</View>
          </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.paper },
  nav: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  navSide: { minHeight: 44, justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20 },
  footer: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 10, gap: 5 },
  titleBlock: { marginTop: 17, marginBottom: 23, gap: 7 },
  title: { color: colors.ink, fontSize: 34, letterSpacing: -1.25, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 17, flexShrink: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.65 },
  action: { minHeight: 52, borderRadius: 14, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', gap: 8 },
  textAction: { minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: 2, paddingVertical: 8 },
  actionTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  inputGroup: { gap: 6 },
  fieldLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  input: { minHeight: 52, color: colors.ink, paddingHorizontal: 13, paddingVertical: 12, fontSize: 17, backgroundColor: colors.sheet, borderColor: colors.outline, borderWidth: 1, borderRadius: 12 },
  inputFocused: { borderColor: colors.action, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 11 },
  multiline: { minHeight: 143, textAlignVertical: 'top' },
  section: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 3 },
  hint: { fontSize: 15, color: colors.muted, flexShrink: 1 },
  body: { fontSize: 17, color: colors.ink, flexShrink: 1 },
  row: { minHeight: 53, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  rowSubtitle: { color: colors.muted, fontSize: 15 },
  rowValue: { color: colors.ink, fontSize: 16, fontVariant: ['tabular-nums'], flexShrink: 1 },
  group: { backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden' },
  stack: { gap: 15 },
  warning: { backgroundColor: colors.warning, borderWidth: 1, borderColor: '#F0D6C8', borderRadius: 9, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  warningText: { flex: 1, color: colors.action, fontSize: 15, fontWeight: '600' },
  banner: { backgroundColor: colors.mint, borderRadius: 10, minHeight: 50, paddingHorizontal: 12, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 7 },
  savedMark: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  savedPaper: { position: 'absolute', top: 2, left: 3, width: 25, height: 32, borderRadius: 4, backgroundColor: colors.sheet, paddingTop: 8, paddingLeft: 5, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  savedRule: { height: 2, borderRadius: 1, backgroundColor: colors.line },
  savedBadge: { position: 'absolute', width: 16, height: 16, right: 1, bottom: 1, borderRadius: 8, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  savedCheckShort: { position: 'absolute', width: 2, height: 4, borderRadius: 1, backgroundColor: '#FFFFFF', left: 4, top: 7, transform: [{ rotate: '-42deg' }] },
  savedCheckLong: { position: 'absolute', width: 2, height: 7, borderRadius: 1, backgroundColor: '#FFFFFF', left: 8, top: 5, transform: [{ rotate: '42deg' }] },
  bannerText: { flex: 1, color: colors.green, fontWeight: '700', fontSize: 15, paddingVertical: 6 },
  bannerAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bannerActionText: { fontSize: 15, color: colors.green, fontWeight: '700', textDecorationLine: 'underline' },
  sheetHost: { flex: 1, backgroundColor: '#1C1B1864', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8 },
  grabber: { width: 33, height: 4, backgroundColor: '#C9C4BA', borderRadius: 4, alignSelf: 'center' },
  sheetNav: { flexDirection: 'row', justifyContent: 'flex-end' },
  sheetTitle: { fontSize: 25, fontWeight: '700', color: colors.ink, letterSpacing: -0.55, marginBottom: 4 },
  sheetContent: { marginTop: 14, gap: 12 },
});
