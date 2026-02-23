Next.js Frontend that displays live vehicle positions from the Trasima REST server on an OpenStreetMap (Leaflet) map.

## Getting Started

### 1) Start the backend (REST server)

Run the provided Jetty/Jersey server (default: `http://localhost:8080`, mounted under `/api/*`).

### 2) Start the frontend

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open `http://localhost:3000` with your browser to see the map.

#### Backend URL / Proxy

The frontend fetches vehicles from `GET /api/trasima/vehicles` and proxies `/api/*` to the backend.

- Default backend base: `http://localhost:8080`
- Override via env var:

```bash
TRASIMA_API_BASE=http://localhost:8080 npm run dev
```

Implementation: `app/components/VehiclesMap.tsx` (polling every 1s; update/create/remove markers; `public/car.svg` icons (rotated by `direction`); popup + sidebar details; error message + retry).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
