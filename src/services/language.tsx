import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'es';
const STORAGE_KEY = '@hwperu_language';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  tr: (english: string, spanish: string) => string;
  locale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<AppLanguage>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'es' || stored === 'en') setCurrentLanguage(stored);
    }).catch(() => undefined);
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: language === 'es' ? 'es-PE' : 'en-US',
    setLanguage: async (nextLanguage) => {
      setCurrentLanguage(nextLanguage);
      await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
    },
    tr: (english, spanish) => language === 'es' ? spanish : english,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
