import './polyfills.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/landing.css';
import './styles/pitch.css';
import './styles/docs.css';
import { App } from './App.js';

const appId = (import.meta as any).env?.VITE_PRIVY_APP_ID || 'cmpz9goa400030ckzrf232454';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email'],
        appearance: { theme: 'light', accentColor: '#292524', logo: undefined },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>,
);
