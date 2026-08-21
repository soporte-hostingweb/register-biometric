import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <title>HWPerú Asistencia</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#051C33" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HWPerú - Asistencia" />
        <meta name="description" content="Plataforma digital de asistencia HWPerú" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/pwa-icon-192.png?v=2" />
        <link rel="shortcut icon" type="image/png" href="/icons/pwa-icon-192.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__pwaInstallPrompt = null;

              window.addEventListener('beforeinstallprompt', function (event) {
                event.preventDefault();
                window.__pwaInstallPrompt = event;
                window.dispatchEvent(new Event('pwa-install-ready'));
              });

              window.addEventListener('appinstalled', function () {
                window.__pwaInstallPrompt = null;
                window.dispatchEvent(new Event('pwa-app-installed'));
              });

              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/push-sw.js').catch(function (error) {
                    console.error('No se pudo registrar el service worker:', error);
                  });
                });
              }
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                margin: 0;
                width: 100%;
                min-height: 100%;
                background: #051C33;
              }

              #login-email-input,
              #login-password-input {
                color: #F1F5F9 !important;
                background-color: transparent !important;
                border: 0 !important;
                outline: 0 !important;
                box-shadow: none !important;
              }

              #login-email-input:autofill,
              #login-password-input:autofill,
              #login-email-input:-webkit-autofill,
              #login-password-input:-webkit-autofill,
              #login-email-input:-webkit-autofill:hover,
              #login-password-input:-webkit-autofill:hover,
              #login-email-input:-webkit-autofill:focus,
              #login-password-input:-webkit-autofill:focus,
              #login-email-input:-webkit-autofill:active,
              #login-password-input:-webkit-autofill:active {
                -webkit-text-fill-color: #F1F5F9 !important;
                -webkit-box-shadow: 0 0 0 1000px rgba(255, 255, 255, 0.06) inset !important;
                box-shadow: 0 0 0 1000px rgba(255, 255, 255, 0.06) inset !important;
                caret-color: #005FF7 !important;
                transition: background-color 9999s ease-in-out 0s !important;
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
