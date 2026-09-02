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
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/pwa-icon-v4-192.png" />
        <link rel="shortcut icon" type="image/png" href="/icons/pwa-icon-v4-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-v4.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__pwaInstallPrompt = null;
              window.__pwaUpdateAvailable = false;

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
              }

              #hwperu-boot-splash {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #051C33;
                animation: hwperuSplashOut 0.36s ease 0.9s forwards;
                pointer-events: none;
              }

              #hwperu-boot-splash img {
                width: min(38vw, 150px);
                height: auto;
                object-fit: contain;
                animation: hwperuLogoIn 0.48s cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
              }

              @keyframes hwperuLogoIn {
                from { opacity: 0; transform: scale(0.78); }
                to { opacity: 1; transform: scale(1); }
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
