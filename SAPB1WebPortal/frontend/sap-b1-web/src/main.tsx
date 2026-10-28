import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import NativeShell from './native/NativeShell';
import ApiConfigError from './native/ApiConfigError';
import { apiConfigProblem } from './native/platform';
import { initSession } from './native/session';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const configProblem = apiConfigProblem();

if (configProblem) {
  // Installed app built without a valid HTTPS API address: say so clearly instead of showing a broken login.
  root.render(<ApiConfigError message={configProblem} />);
} else {
  // The secure session store loads once, before the first render (instant on the website).
  void initSession().then(() => {
    root.render(
      <React.StrictMode>
        <ThemeProvider>
          <ToastProvider>
            <BrowserRouter>
              <NativeShell />
              <AuthProvider>
                <App />
              </AuthProvider>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </React.StrictMode>
    );
  });
}
