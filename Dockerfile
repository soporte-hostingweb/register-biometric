# Build stage
FROM node:20-alpine AS build
WORKDIR /app
ARG EXPO_PUBLIC_API_URL=https://gestor.hwperu.com
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
COPY package*.json ./
RUN npm install
COPY . .
RUN npx expo export

# Production stage using Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
