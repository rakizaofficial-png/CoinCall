import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
} from 'react-native';
import {
  fetchHostAppUpdate,
  listenHostAppUpdate,
  shouldForceUpdate,
  type HostAppUpdateConfig,
} from '../services/appUpdateService';

/**
 * Blocks the host app when admin enables force update and
 * the installed build is below minVersion.
 */
export function useHostForceUpdate() {
  const [config, setConfig] = useState<HostAppUpdateConfig | null>(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback((cfg: HostAppUpdateConfig | null) => {
    if (!cfg) return;
    setConfig(cfg);
  }, []);

  const refresh = useCallback(async () => {
    const cfg = await fetchHostAppUpdate();
    if (cfg) apply(cfg);
    setReady(true);
  }, [apply]);

  useEffect(() => {
    void refresh();
    const off = listenHostAppUpdate((cfg) => apply(cfg));
    const onApp = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onApp);
    const poll = setInterval(() => void refresh(), 60_000);
    return () => {
      off();
      sub.remove();
      clearInterval(poll);
    };
  }, [apply, refresh]);

  const blocked = shouldForceUpdate(config);

  return {
    ready,
    blocked,
    config,
    refresh,
  };
}
