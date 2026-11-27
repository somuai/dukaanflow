import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useApp } from '../src/app-state';
import { Action, Hint, Screen, Title, colors } from '../src/ui';
import { LaunchScreen } from '../src/LaunchScreen';
import { reloadAppAsync } from 'expo';

function Navigator() {
  const { busy, t, workspaceRestartRequired } = useApp();
  const [resumeLoaderVisible, setResumeLoaderVisible] = useState(false);
  const previousState = useRef(AppState.currentState);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = previousState.current === 'background';
      previousState.current = nextState;
      if (!wasBackgrounded || nextState !== 'active') return;

      setResumeLoaderVisible(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setResumeLoaderVisible(false), 560);
    });
    return () => {
      subscription.remove();
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  if (workspaceRestartRequired) return (
    <Screen>
      <Title title={t('Backup restored', 'बैकअप बहाल हुआ')} />
      <Hint>{t('Reopen DukaanFlow to use the restored shops and records.', 'बहाल दुकानें और रिकॉर्ड इस्तेमाल करने के लिए DukaanFlow फिर खोलें।')}</Hint>
      <Action title={t('Reopen DukaanFlow', 'DukaanFlow फिर खोलें')} onPress={() => void reloadAppAsync('DukaanFlow backup restore').catch(() => {})} />
    </Screen>
  );

  return (
    <View style={styles.navigator}>
      <Stack screenOptions={{
        headerShown: false,
        gestureEnabled: !busy,
        contentStyle: { backgroundColor: colors.paper },
      }}>
        <Stack.Screen name="[page]" dangerouslySingular={(_name, params) => String(params.page)} />
      </Stack>
      {resumeLoaderVisible ? <View pointerEvents="auto" style={styles.resumeLoader}><LaunchScreen /></View> : null}
    </View>
  );
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><AppProvider><Navigator /></AppProvider></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  navigator: { flex: 1 },
  resumeLoader: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
});
