import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initDatabase } from '@/db/database';
import { settings } from '@/repositories/settings-repository';
import { getDeviceId } from '@/device/device-id';
import { loadGraph, reconcileGraphVersion, validateGraph } from '@/core';
import { AppShell } from '@/ui';

/**
 * Root application component.
 *
 * Phase 2: Wires initDatabase() on mount. The DB is opened and all pending
 * schema migrations are applied before the main content is rendered.
 *
 * Phase 3: After DB ready, hydrates the settings cache and ensures the stable
 * device id is minted. All three steps must complete before consumer content
 * is rendered so that synchronous settings.get() calls are safe.
 *
 * Stage-02 Phase 4: Inserts the graph load + version reconciliation step after
 * settings.hydrate() and before getDeviceId(). Stage-02 Phase 5 adds graph
 * structural validation immediately after reconciliation. The startup order is:
 *   initDatabase → settings.hydrate →
 *   reconcileGraphVersion(loadGraph()) → validateGraph(loadGraph()) →
 *   getDeviceId
 * Schema migrations (DB-schema axis) always precede graph-content migrations
 * (graph-content axis). validateGraph runs after reconciliation so that any
 * future migration op that repairs the graph runs before validation. The two
 * version axes are NEVER conflated.
 *
 * Stage-06 Phase 7: Once the startup chain completes, mounts `<AppShell/>`
 * (`src/ui/AppShell.tsx`) — the real node-map ↔ task-screen presentation
 * shell — in place of the stage-01..05 scaffold. `AppShell` initializes i18n
 * (`initI18n`) on its OWN first effect; this is safe because `settings.hydrate()`
 * has already resolved `uiLanguage` by the time `AppShell` is ever mounted here.
 * The export-backup affordance (Phase 6 scaffold) is superseded by the shell's
 * own chrome — a settings/backup surface is out of this stage's scope (see
 * feature-plan "What Is NOT Implemented"); `exportBackup`/`BackupTooNewError`
 * remain exercised directly by their own repository tests.
 *
 * Anti-shame invariant: nothing in this component ever surfaces a loss event
 * or subtracted state. Errors are routing signals, handled downstream.
 */
export default function App(): React.JSX.Element {
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Startup sequence (must be in order):
    //   1. Open DB + run schema migrations (initDatabase)
    //      — DB-schema axis (PRAGMA user_version). MUST come first.
    //   2. Hydrate settings cache from DB (settings.hydrate)
    //      — loads appliedGraphVersion (and uiLanguage) from DB into the
    //        in-memory cache. `AppShell`'s own i18n init depends on this
    //        having already completed.
    //   3. Load graph asset + reconcile graph-content version
    //      (reconcileGraphVersion(loadGraph()))
    //      — graph-content axis (appliedGraphVersion settings key, NOT user_version).
    //        Applies any pending node-identity migration ops, then persists the
    //        new graphVersion. On first install: no-op ops list, persists '0.1.0'.
    //        STRICTLY after schema migrations (schema must exist before graph ops).
    //   4. Validate the graph structure (validateGraph(loadGraph()))
    //      — ensures the graph is a valid DAG with correct band ladders.
    //        Runs after reconciliation so any future migration op that repairs
    //        the graph runs before validation. Cheap at startup; catches a
    //        malformed OTA graph before any generation code runs.
    //   5. Ensure device id is minted (getDeviceId)
    // Only after all five steps is it safe to render <AppShell/>.
    initDatabase()
      .then(() => settings.hydrate())
      .then(() => reconcileGraphVersion(loadGraph()))
      .then(() => { validateGraph(loadGraph()); })
      .then(() => getDeviceId())
      .then(() => {
        if (!cancelled) setDbReady(true);
      })
      .catch((err: unknown) => {
        // DB init failure is fatal — surface a minimal diagnostic message.
        // This path should never occur in production (migration runner is
        // tested; SQLite open on a real device always succeeds).
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (initError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Startup error</Text>
        <Text style={styles.errorBody}>{initError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      <AppShell />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#c00',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: '#600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
