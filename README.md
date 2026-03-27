# Solar Landscape Hackathon 2026

Welcome to the Solar Landscape Hackathon.

This repository is owned by Solar Landscape and is public during the event to enable collaboration. All work submitted here becomes part of the official hackathon record.

Please read these instructions carefully before starting.

---

## Repository Rules

- This repository is public during the hackathon, but will moved to a private repository after the hackathon.
- Do not commit secrets (API keys, tokens, passwords, connection strings).
- All work must be committed to GitHub by the submission deadline.
- The final state of your team branch at the deadline will be used for judging.

---

## Team Workflow

### 1. Clone the Repository

```bash
git clone https://github.com/solarlandscape/<repo-name>.git
cd <repo-name>
```

### 2. Commit Early, Commit Often
```bash
git add .
git commit -m "Short descriptive message"
git push
```
Best practices:
 - Use meaningful commit messages
 - Push frequently
 - Keep your branch up to date with main if needed

### 3. Required Submission Structure

Your repository must contain the following before the deadline:
```bash
/
├── README.md
├── src/ (or your main code folder)
└── docs/
    ├── architecture-diagram.(png|jpg|pdf)
    ├── demo.md (optional but encouraged)
    └── screenshots/
```

#### Required README Sections

Update this `README.md` with the following sections:

Project Overview
 - What problem does this solve?
 - Why is it valuable?

Architecture
 - High-level system design
 - Key technologies used
 - Architecture diagram stored in /docs
 - How to run the project

Known Limitations
 - What would you improve with more time?
 - What edge cases are not handled?

### 4. Submission Deadline

All code must be pushed before:

`Friday at 3:30PM EST`

The latest commit timestamp on your team branch will be considered final.

### 5. Code Ownership

By participating, you acknowledge:
 - This repository is owned by Solar Landscape.
 - All submitted code remains in this repository after the event.
 - The organization may use, modify, or build upon submitted projects.

---

## Project overview: GoSolar — Rooftop Intelligence Platform

> *Is your roof worth more as solar or a data center? Let's find out.*

A full-stack web application that evaluates commercial/industrial buildings to determine whether they're better candidates for **rooftop solar** or **edge data centers**. **GoSolar** helps building owners compare solar leasing with data-center conversion.

---

## Architecture

```
/
├── client/          # React + Vite + Tailwind frontend
└── server/          # Node.js + Express backend
    ├── routes/      # API endpoints
    ├── services/    # Per-source data fetchers
    ├── scoring/     # Pure scoring engine
    └── cache/       # Startup data loaders
```

---

## Data Sources (10+)

| Source | What We Get | API |
|--------|-------------|-----|
| Google Geocoding / Nominatim | lat/lng, city, state, ZIP | Geocoding API |
| Census Geocoder | Census block + county FIPS | Free |
| FCC BDC | Fiber/broadband providers | Free |
| FEMA NFHL | Flood zone (AE/VE disqualifier) | Free ArcGIS |
| FEMA NRI | County natural hazard risk | Free CSV |
| NREL PVWatts | Annual solar kWh | Free key |
| US Drought Monitor | D0–D4 drought level | Free |
| HIFLD Substations | Nearest electrical substation | Free ArcGIS |
| PeeringDB | Nearest Internet Exchange Point | Free |
| Census Business Patterns | Tech company density (NAICS 5112/5415) | Free |
| OpenFEMA | Disaster declaration history | Free |
| Google Places | Building type classification | Places API |

---

## Scoring Model

### DC Feasibility Score (0–100)

| Criterion | Weight |
|-----------|--------|
| Connectivity (FCC + IXP) | 22% |
| Natural Disaster Risk (FEMA NRI, inverted) | 20% |
| Power Infrastructure (Substation) | 18% |
| Tech Demand Proximity (Census) | 15% |
| Building Suitability (Places) | 12% |
| Water Availability (Drought) | 8% |
| Latency Potential (IXP) | 3% |
| Execution Risk (FEMA Disasters) | 2% |

**Hard Disqualifier Caps:**
- Flood Zone AE → max DC score = 30
- Flood Zone VE → max DC score = 25
- Retail building type → max DC score = 35
- D3 drought → max DC score = 40
- D4 drought → max DC score = 35

### Solar Score (0–100)

| Criterion | Weight |
|-----------|--------|
| NREL Irradiance | 40% |
| Inverse DC Score | 30% |
| Roof Suitability | 30% |

---

## Setup

### Prerequisites
- Node.js 18+
- API keys (optional but recommended):
  - [Google Cloud](https://console.cloud.google.com/) — Geocoding API + Places API
  - [NREL](https://developer.nrel.gov/) — Free registration for PVWatts

### Installation

```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### Configuration

Copy `.env.example` to `.env` in the server directory:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:
```env
GOOGLE_PLACES_API_KEY=your_key_here
GOOGLE_GEOCODING_API_KEY=your_key_here
NREL_API_KEY=your_key_here   # or use DEMO_KEY (rate limited)
PORT=3001
```

**Without API keys:** The app works! Google APIs fall back to OpenStreetMap Nominatim (geocoding) and address-heuristic building classification. NREL uses `DEMO_KEY` (rate limited to 10 req/hr).

### Running Locally

```bash
# Terminal 1 — Start backend
cd server && npm run dev

# Terminal 2 — Start frontend
cd client && npm run dev
```

Open http://localhost:5173

On first startup, the server will:
1. Download FEMA NRI county CSV (~15MB, cached to `/server/data/nri_county.csv`)
2. Download HIFLD substation data (~10MB, cached to `/server/data/substations.json`)
3. Fetch PeeringDB IXP list (cached in memory for 24h)

---

## Deployment

### Railway (Recommended)

```bash
# Deploy server
cd server
railway init && railway up

# Deploy client (after setting VITE_API_URL)
cd client
VITE_API_URL=https://your-server.railway.app/api npm run build
```

### Vercel (Frontend) + Railway (Backend)

1. Deploy backend to Railway, copy the URL
2. Set `VITE_API_URL=https://your-backend.railway.app/api` in Vercel environment
3. Deploy client to Vercel: `vercel --prod`

---

## API Reference

### `POST /api/evaluate`

Request:
```json
{ "address": "100 Winchester Circle, Los Gatos, CA 95032" }
```

Response:
```json
{
  "address": "100 Winchester Cir, Los Gatos, CA 95032, USA",
  "coordinates": { "lat": 37.23, "lng": -121.97 },
  "dcScore": 42,
  "solarScore": 78,
  "recommendation": "LEAN_SOLAR",
  "verdict": "...",
  "solarPitch": "...",
  "criteria": [...],
  "hardDisqualifiers": [],
  "insights": [...],
  "topSolarReasons": [...],
  "solarMetrics": {
    "annualKWh": 131500,
    "estimatedAnnualRevenue": 63000,
    "co2OffsetTons": 93
  }
}
```

---

## Features

- **Dual Score Gauges** — Animated circular DC Feasibility + Solar Viability scores
- **Verdict Banner** — Color-coded STRONG SOLAR / LEAN DC / NEUTRAL recommendations
- **Full Criteria Breakdown** — Expandable cards + sortable table with weights
- **Solar Revenue Calculator** — Annual kWh + estimated lease + CO₂ offset
- **"What Would Change This Score?"** — Actionable hypothetical insights
- **Side-by-Side Comparison** — Compare up to 3 addresses
- **Interactive Map** — Leaflet with substation and IXP markers
- **Rooftop Defender Badge** — 🌞 Certified Solar Champion for strong solar wins
- **Hard Disqualifiers** — Flood zone/drought caps with clear explanations
- **Data Freshness** — Timestamped source attribution for every criterion

---

## License

MIT — GoSolar Hackathon 2026
