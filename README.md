# Freya Project Dev Guide

This repository hosts a small full-stack demo consisting of a Next.js dashboard, a Node-based agent service, and a local LiveKit media server. The frontend connects to LiveKit for data channels, while the agent streams responses back into the same room using the LiveKit server SDK.

## Prerequisites

- Node.js 20+
- pnpm (for the Next.js app)
- npm (for the agent service)
- Docker Desktop (needed to run the LiveKit server locally)

## Quick Start

1. **Launch LiveKit** – the frontend and agent both require a running LiveKit server. Run the container directly (no wrapper script needed):

	```powershell
	docker compose up livekit

    docker run --rm -it `
  -p 7880:7880 `
  -p 7881:7881 `
  -p 7882:7882/udp `
  -p 50000-50010:50000-50010/udp `
  -v "${PWD}/livekit.yaml:/livekit.yaml" `
  livekit/livekit-server:latest `
  --config /livekit.yaml 


  pnpm prisma db push
	```

	Exposing the UDP ports (7882 and 50000-50010) allows browsers to complete the WebRTC peer connection. Leave this terminal running while you develop.

2. **Start the agent service**:

	```powershell
	docker compose up agent
	```

	The agent loads environment variables from `.env`, connects to LiveKit via the server SDK, and exposes a health endpoint on `http://localhost:4001/health`.

3. **Start the Next.js app**:

	```powershell
	docker compose up next
	```

	The frontend reads `NEXT_PUBLIC_LIVEKIT_URL` from `app/.env` (defaults to `ws://localhost:7880`) and connects to the same LiveKit room as the agent.

Visit `http://localhost:3000` to interact with the dashboard and Live Chat column.

## Troubleshooting

- **`ERR_CONNECTION_REFUSED` when connecting to LiveKit** – ensure the LiveKit server is running (step 1). The agent and frontend now surface explicit error messages when LiveKit cannot be reached.
- **Port conflicts** – adjust the `livekit.yaml` port settings and update the environment variables (`LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`) accordingly.

## Project Structure

- `app/` – Next.js 15 frontend, API routes, and LiveKit client hook
- `agent/` – Node.js worker that streams responses over LiveKit data channels
- `scripts/` – helper scripts (optional)
- `livekit.yaml` – LiveKit server configuration for local development
