import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { replaceScreen, useApp } from '../src/app-state';
import { Welcome } from '../src/screens';
import { LaunchScreen } from '../src/LaunchScreen';
import { Action, Screen, Warning } from '../src/ui';

export default function Index() {
  const app = useApp();
  const [minimumSplashElapsed, setMinimumSplashElapsed] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setMinimumSplashElapsed(true), 640);
    return () => clearTimeout(timeout);
  }, []);

  useFocusEffect(useCallback(() => {
    if (app.ready && app.mode && minimumSplashElapsed) replaceScreen(app.openingStockPending ? 'opening-stock' : 'deliveries');
  }, [app.ready, app.mode, app.openingStockPending, minimumSplashElapsed]));

  if (!app.ready || !minimumSplashElapsed || app.mode) {
    return (
      app.problem
        ? <Screen><Warning>{app.problem}</Warning><Action title="Try again" onPress={() => void app.initialize()} /></Screen>
        : <LaunchScreen />
    );
  }

  return <Welcome />;
}
