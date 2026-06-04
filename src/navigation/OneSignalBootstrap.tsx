/**
 * OneSignalBootstrap.tsx
 * Calls initOneSignalSDK() inside useEffect — now a no-op since we use REST API mode.
 * Kept for clean architecture — loginOneSignal() is called from fcmService after login.
 */

import { useEffect } from 'react';
import { initOneSignalSDK } from '../services/oneSignalService';

const OneSignalBootstrap = () => {
  useEffect(() => {
    initOneSignalSDK();
  }, []);
  return null;
};

export default OneSignalBootstrap;
