import './styles/index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

import MainTabs from './components/MainTabs';
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <MainTabs><App /></MainTabs>
  </React.StrictMode>
);
