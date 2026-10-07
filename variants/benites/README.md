# Variante Benites

Copias de las pantallas para la segunda app. Se usan a mano: se sustituye el
archivo correspondiente de `src/app/` por el de aquí antes de compilar esa
versión.

## Por qué no viven en `src/app/`

Expo Router convierte en **ruta** todo archivo que encuentre dentro de
`src/app/`. Eso tenía dos consecuencias, una molesta y otra que rompía el
despliegue:

1. `dashboard-Benites.tsx`, `index-Benites.tsx` y los demás se publicaban como
   páginas reales: `/dashboard-Benites`, `/index-Benites`… Una copia entera de
   la app accesible desde fuera, sin que nadie lo pretendiera.

2. `+html-Benites.tsx` **rompía el build**. El prefijo `+` está reservado para
   los archivos especiales que Expo Router conoce, y cualquier otro nombre que
   empiece por `+` aborta `npx expo export`:

   ```
   Metro error: Invalid route ./+html-Benites.tsx.
   Route nodes cannot start with the '+' character.
   ```

Fuera de `src/app/` no se escanean, así que las copias se conservan sin
publicarse ni estorbar al compilado.

Las otras dos piezas de la variante siguen en su sitio porque esas carpetas no
son rutas y no dan problema: `src/services/api-Benites.ts` y
`src/styles/dashboard-Benites.ts`.
