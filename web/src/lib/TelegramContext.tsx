'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getTelegramWebApp, TelegramWebApp } from './telegram';

interface TelegramContextValue {
  tg: TelegramWebApp | null;
  userId: string | null;
  isTelegram: boolean;
  ready: boolean;
}

const TelegramContext = createContext<TelegramContextValue>({
  tg: null,
  userId: null,
  isTelegram: false,
  ready: false,
});

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TelegramContextValue>({
    tg: null,
    userId: null,
    isTelegram: false,
    ready: false,
  });

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (tg) {
      tg.ready();
      tg.expand();

      const userId = tg.initDataUnsafe?.user?.id;

      if (tg.backgroundColor) {
        document.body.style.backgroundColor = tg.backgroundColor;
      }

      setState({
        tg,
        userId: userId ? String(userId) : null,
        isTelegram: true,
        ready: true,
      });
    } else {
      setState(prev => ({ ...prev, ready: true }));
    }
  }, []);

  return (
    <TelegramContext.Provider value={state}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram() {
  return useContext(TelegramContext);
}
