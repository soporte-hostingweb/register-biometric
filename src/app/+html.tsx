import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <title>HWPerú - Asistencia</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#121212" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HWPerú - Asistencia" />
        <meta name="description" content="Plataforma digital de asistencia HWPerú" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.png" />
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
              #login-password-input,
              #forgot-password-email-input {
                color: #F1F5F9 !important;
                background-color: transparent !important;
                border: 0 !important;
                outline: 0 !important;
                box-shadow: none !important;
              }

              #login-email-input:autofill,
              #login-password-input:autofill,
              #forgot-password-email-input:autofill,
              #login-email-input:-webkit-autofill,
              #login-password-input:-webkit-autofill,
              #forgot-password-email-input:-webkit-autofill,
              #login-email-input:-webkit-autofill:hover,
              #login-password-input:-webkit-autofill:hover,
              #forgot-password-email-input:-webkit-autofill:hover,
              #login-email-input:-webkit-autofill:focus,
              #login-password-input:-webkit-autofill:focus,
              #forgot-password-email-input:-webkit-autofill:focus,
              #login-email-input:-webkit-autofill:active,
              #login-password-input:-webkit-autofill:active,
              #forgot-password-email-input:-webkit-autofill:active {
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
