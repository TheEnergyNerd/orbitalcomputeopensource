# Orbital Compute Control Room

A 3D interactive visualization dashboard showing the interaction between orbital compute infrastructure (satellites) and ground-based hyperscale data centers.

## Features

- **3D Globe Visualization**: Full Earth view with satellite orbits and ground data centers
- **Real-time Simulation**: Live updates showing power consumption, latency, cost, and carbon metrics
- **Interactive Scenarios**: 
  - Normal operation
  - Price spike (ground energy costs increase)
  - Solar storm (satellite capacity degradation)
  - Fiber cut (regional connectivity issues)
- **Workload Routing**: Adjustable slider to route jobs between orbital and ground infrastructure
- **Entity Interaction**: Click on satellites, orbital hubs, or ground sites to see detailed metrics
- **Camera Presets**: Quick navigation to Earth view or Abilene data center

## Project Structure

```
orbitalcompute/
├── backend/          # Python FastAPI server
│   ├── main.py      # Main API and simulation engine
│   └── requirements.txt
├── frontend/         # Next.js + CesiumJS application
│   ├── app/
│   │   ├── components/  # React components
│   │   ├── context/     # React context for state
│   │   └── types.ts     # TypeScript type definitions
│   └── package.json
└── README.md
```

## Setup

### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (recommended):
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
uvicorn main:app --reload --port 8000
```

The backend will:
- Fetch Starlink TLE data from CelesTrak on startup
- Start the simulation engine that updates every second
- Serve the API at `http://localhost:8000`

### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file:
```bash
cp .env.local.example .env.local
```

4. Edit `.env.local` and add your Cesium Ion token:
```
NEXT_PUBLIC_CESIUM_ION_TOKEN=your_token_here
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

To get a Cesium Ion token:
- Sign up at https://cesium.com/ion/
- Create a new access token
- Copy it to your `.env.local` file

5. Run the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## API Endpoints

- `GET /health` - Health check
- `GET /state` - Get current simulation state
- `POST /scenario` - Update scenario mode or orbit offload percentage
  ```json
  {
    "mode": "normal" | "price_spike" | "solar_storm" | "fiber_cut",
    "orbitOffloadPercent": 0-100
  }
  ```

## Data Sources

- **Satellite TLEs**: Fetched from CelesTrak (Starlink constellation)
- **Ground Sites**: Hardcoded locations (Abilene, NoVA, DFW, Phoenix)
- **Workload Profile**: Synthetic profile based on typical data center workloads

## Technologies

- **Backend**: Python, FastAPI, Skyfield, SGP4
- **Frontend**: Next.js, React, TypeScript, CesiumJS, Tailwind CSS
- **3D Visualization**: CesiumJS for globe rendering and satellite visualization

## Notes

- The simulation uses simplified models for power consumption, latency, and routing
- Satellite positions are propagated using TLE data and Skyfield
- Workload generation is synthetic but follows realistic patterns
- Carbon intensity varies by region (approximated)

