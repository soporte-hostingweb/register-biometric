import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <title>HWPerú Asistencia</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#051C33" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HWPerú - Asistencia" />
        <meta name="description" content="Plataforma digital de asistencia HWPerú" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/pwa-icon-v4-192.png" />
        <link rel="shortcut icon" type="image/png" href="/icons/pwa-icon-v4-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-v4.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__pwaInstallPrompt = null;
              window.__pwaUpdateAvailable = false;

              // Safari ignora user-scalable=no desde iOS 10, asi que el pellizco hay
              // que cancelarlo por eventos. Los "gesture*" son propios de Safari; el
              // doble toque se detecta por el tiempo entre toques porque iOS no expone
              // un evento para el. En Android basta el viewport y esto no le afecta.
              (function blockZoomGestures() {
                var cancel = function (event) { event.preventDefault(); };
                document.addEventListener('gesturestart', cancel, { passive: false });
                document.addEventListener('gesturechange', cancel, { passive: false });
                document.addEventListener('gestureend', cancel, { passive: false });

                var lastTouchEnd = 0;
                document.addEventListener('touchend', function (event) {
                  var now = Date.now();
                  if (now - lastTouchEnd <= 300) event.preventDefault();
                  lastTouchEnd = now;
                }, { passive: false });

                // Dos dedos a la vez sobre la pantalla solo pueden ser un pellizco.
                document.addEventListener('touchmove', function (event) {
                  if (event.touches.length > 1) event.preventDefault();
                }, { passive: false });
              })();

              function notifyUpdateAvailable() {
                if (window.__pwaUpdateAvailable) return;
                window.__pwaUpdateAvailable = true;
                window.dispatchEvent(new Event('pwa-update-available'));
              }

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
                  var refreshing = false;
                  var registration;

                  window.__applyPwaUpdate = async function () {
                    if (refreshing) return;
                    refreshing = true;
                    try {
                      if (registration) await registration.update();
                    } finally {
                      window.location.reload();
                    }
                  };

                  navigator.serviceWorker.register('/push-sw.js').then(function (nextRegistration) {
                    registration = nextRegistration;
                    registration.addEventListener('updatefound', function () {
                      var worker = registration.installing;
                      if (!worker) return;
                      worker.addEventListener('statechange', function () {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                          notifyUpdateAvailable();
                        }
                      });
                    });

                    var initialHtmlSignature = null;
                    function checkHtmlVersion() {
                      fetch('/', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
                        .then(function (response) { return response.text(); })
                        .then(function (html) {
                          var signature = html.match(/\/_expo\/static\/[^\"']+/g)?.join('|') || html.length + ':' + html.slice(0, 512);
                          if (initialHtmlSignature === null) initialHtmlSignature = signature;
                          else if (signature !== initialHtmlSignature) notifyUpdateAvailable();
                        })
                        .catch(function () {});
                    }

                    checkHtmlVersion();
                    window.setInterval(checkHtmlVersion, 300000);
                  }).catch(function (error) {
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

                /* Android infla por su cuenta el texto de bloques anchos; esto lo
                   desactiva para que manden los tamaños que define la app. */
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;

                /* Quita el retardo de 300ms y el zoom por doble toque. */
                touch-action: manipulation;

                /* Evita que el scroll encadene con el navegador anfitrión: sin esto,
                   tirar hacia abajo dispara "recargar" en la PWA de Android. */
                overscroll-behavior-y: contain;
              }

              /* La selección por pulsación larga estorba al tocar botones y no aporta
                 nada en una app de fichaje. Los campos de entrada la conservan. */
              body {
                -webkit-user-select: none;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
              }

              input, textarea {
                -webkit-user-select: text;
                user-select: text;
                /* iOS hace zoom automático al enfocar un campo de menos de 16px. */
                font-size: 16px;
              }

              #hwperu-boot-splash {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                /* Exactamente el background_color del manifest. Un degradado, por sutil
                   que fuera, delataba el corte: Android pinta su splash en color plano
                   y al aparecer este se veía cambiar el fondo. */
                background: #051C33;
                animation: hwperuSplashOut 0.38s ease 0.75s forwards;
                pointer-events: none;
              }

              /* El mismo monograma, al mismo tamaño y en la misma posición que el splash
                 que Android genera desde el manifest. El relevo entre uno y otro debe ser
                 imperceptible. */
              #hwperu-boot-splash img {
                width: min(58vw, 250px);
                height: auto;
                object-fit: contain;

                /* Sin animación de entrada a propósito: el logo ya lleva un instante en
                   pantalla, puesto ahí por el sistema. Cualquier aparición o escalado
                   delataría que son dos pantallas distintas. */
              }

              @keyframes hwperuSplashOut {
                to { opacity: 0; visibility: hidden; }
              }

              @media (prefers-reduced-motion: reduce) {
                #hwperu-boot-splash,
                #hwperu-boot-splash img {
                  animation-duration: 0.01ms;
                }
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

              #profile-new-password-input,
              #profile-confirm-password-input {
                color: #FFFFFF !important;
                background: transparent !important;
                border: 0 !important;
                outline: none !important;
                box-shadow: none !important;
                -webkit-appearance: none !important;
              }

              #profile-new-password-input:focus,
              #profile-confirm-password-input:focus,
              #profile-new-password-input:autofill,
              #profile-confirm-password-input:autofill,
              #profile-new-password-input:-webkit-autofill,
              #profile-confirm-password-input:-webkit-autofill,
              #profile-new-password-input:-webkit-autofill:hover,
              #profile-confirm-password-input:-webkit-autofill:hover,
              #profile-new-password-input:-webkit-autofill:focus,
              #profile-confirm-password-input:-webkit-autofill:focus {
                color: #FFFFFF !important;
                -webkit-text-fill-color: #FFFFFF !important;
                background: transparent !important;
                border: 0 !important;
                outline: none !important;
                box-shadow: none !important;
                -webkit-box-shadow: 0 0 0 1000px #131C25 inset !important;
                caret-color: #77C3FF !important;
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>
        <div id="hwperu-boot-splash" aria-hidden="true">
          <img src="/icons/hwperu-logo-v4.png" alt="" />
        </div>
        {children}
      </body>
    </html>
  );
}
