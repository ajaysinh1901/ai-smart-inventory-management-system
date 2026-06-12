/**
 * useWorkspace.js
 *
 * Fetches workspace/settings once and exposes paiseDisplay + weightDisplay
 * preferences that drive price formatting in the products list.
 *
 * Backend endpoint: GET /api/v1/settings
 * The Settings model keeps workspace fields including:
 *   workspace.paiseDisplay  (boolean, default per storeProfile)
 *   workspace.weightDisplay ('mixed' | 'decimal', default per storeProfile)
 *
 * Falls back to safe defaults if the endpoint is not yet available.
 */
import { useState, useEffect } from 'react';
import { getSettings } from '../services/settingsService';

const DEFAULT_PREFS = {
  paiseDisplay:  true,
  weightDisplay: 'decimal',
  storeProfile:  'small',
};

let cachedPrefs = null; // module-level cache — avoid repeated fetches

export function useWorkspace() {
  const [prefs, setPrefs] = useState(cachedPrefs || DEFAULT_PREFS);
  const [loading, setLoading] = useState(!cachedPrefs);

  useEffect(() => {
    if (cachedPrefs) return; // already fetched in this session
    let cancelled = false;

    getSettings()
      .then((res) => {
        if (cancelled) return;
        const ws = res.data?.data?.workspace || res.data?.workspace || {};
        const resolved = {
          paiseDisplay:  ws.paiseDisplay  ?? DEFAULT_PREFS.paiseDisplay,
          weightDisplay: ws.weightDisplay ?? DEFAULT_PREFS.weightDisplay,
          storeProfile:  ws.storeProfile  ?? DEFAULT_PREFS.storeProfile,
        };
        cachedPrefs = resolved;
        setPrefs(resolved);
      })
      .catch(() => {
        // Endpoint may not have these fields yet — keep defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { prefs, loading };
}
