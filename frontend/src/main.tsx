import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './styles/components.css';
import { SDK } from './lib/sdk';
import { App } from './App';

// Expose SDK before any plugin script can load
window.__hpkg_sdk = SDK;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
