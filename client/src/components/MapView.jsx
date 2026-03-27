import { useEffect, useRef, useState } from 'react';

// Lazy-load Leaflet to avoid SSR issues
let L = null;

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Satellite rooftop view via server proxy (`GET /api/map-static`) so the Google key
 * stays on the server — no VITE_ key or HTTP referrer issues in the browser.
 * Fallback: direct Static API with VITE_GOOGLE_MAPS_STATIC_API_KEY if proxy fails.
 */
function RooftopImage({ lat, lng }) {
  const [status, setStatus] = useState('loading'); // loading | ok | error

  const proxyUrl = `${API_BASE}/map-static?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
  const viteKey = import.meta.env.VITE_GOOGLE_MAPS_STATIC_API_KEY
    || import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY;
  const directUrl = viteKey && !viteKey.startsWith('your_')
    ? [
        'https://maps.googleapis.com/maps/api/staticmap',
        `?center=${lat},${lng}`,
        '&zoom=19&size=640x360&maptype=satellite',
        `&markers=color:red%7C${lat},${lng}`,
        `&key=${viteKey}`,
      ].join('')
    : null;

  const [src, setSrc] = useState(proxyUrl);

  useEffect(() => {
    setStatus('loading');
    setSrc(`${API_BASE}/map-static?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
  }, [lat, lng]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 mb-4 shadow-sm">
      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">🛰️</span>
          <span className="text-white text-xs font-semibold">Satellite Rooftop View</span>
        </div>
        <span className="text-slate-300 text-xs">Google Maps Static API · zoom 19</span>
      </div>
      {status === 'error' ? (
        <div className="bg-amber-50 border-t border-amber-200 p-4 text-sm text-slate-800">
          <p className="font-semibold text-amber-900 mb-2">Could not load satellite image</p>
          <ul className="list-disc list-inside space-y-1 text-slate-700 text-xs leading-relaxed">
            <li>
              Set <code className="bg-white px-1 rounded border border-slate-200">GOOGLE_MAPS_STATIC_API_KEY</code> or{' '}
              <code className="bg-white px-1 rounded border border-slate-200">GOOGLE_GEOCODING_API_KEY</code> in{' '}
              <strong>server</strong> <code className="bg-white px-1 rounded">.env</code> (same key as Geocoding is fine), enable{' '}
              <strong>Maps Static API</strong> in Google Cloud Console, ensure billing is on, then restart the API server.
            </li>
            <li>
              If the key has <strong>HTTP referrer</strong> restrictions, browser-direct URLs fail — the app uses the server proxy at{' '}
              <code className="bg-white px-1 rounded">{API_BASE}/map-static</code> so the key does not need localhost in referrers.
            </li>
          </ul>
        </div>
      ) : (
        <img
          src={src}
          alt="Aerial satellite view of evaluated building rooftop"
          className="w-full block bg-slate-100 min-h-[200px]"
          onLoad={() => setStatus('ok')}
          onError={() => {
            setSrc((prev) => {
              const proxy = `${API_BASE}/map-static?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
              if (prev === proxy && directUrl) {
                return directUrl;
              }
              setStatus('error');
              return prev;
            });
          }}
        />
      )}
    </div>
  );
}

export default function MapView({ coordinates, address, criteria }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!coordinates?.lat || !coordinates?.lng) return;

    const initMap = async () => {
      if (!L) {
        L = await import('leaflet');
        // Fix default marker icons
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });
      }

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [coordinates.lat, coordinates.lng],
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
      });

      mapInstanceRef.current = map;

      // Light basemap — matches app UI
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Main address marker
      const mainIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 12px rgba(245,158,11,0.6);
        "></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      L.marker([coordinates.lat, coordinates.lng], { icon: mainIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: system-ui; padding: 4px;">
            <strong style="color: #1e293b;">📍 Evaluated Location</strong><br/>
            <span style="font-size: 12px; color: #475569;">${address}</span>
          </div>
        `, { maxWidth: 250 })
        .openPopup();

      // Substation marker (from criteria)
      const substationCrit = criteria?.find(c => c.name === 'Power Infrastructure');
      if (substationCrit && substationCrit.rawValue && !substationCrit.rawValue.includes('unavailable')) {
        // Parse distance and create approximate marker
        const distMatch = substationCrit.rawValue.match(/(\d+\.?\d*)\s*miles/);
        if (distMatch) {
          const distMiles = parseFloat(distMatch[1]);
          const approxLat = coordinates.lat + (distMiles * 0.0145); // rough offset north
          const subIcon = L.divIcon({
            className: '',
            html: `<div style="
              background: #3b82f6; color: white; font-size: 16px;
              width: 32px; height: 32px; border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              border: 2px solid white; box-shadow: 0 2px 8px rgba(59,130,246,0.5);
            ">⚡</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker([approxLat, coordinates.lng], { icon: subIcon })
            .addTo(map)
            .bindPopup(`<strong>⚡ Nearest Substation</strong><br/><small>${substationCrit.rawValue}</small>`);
        }
      }

      // IXP marker
      const ixpCrit = criteria?.find(c => c.name === 'IXP / Latency Potential');
      if (ixpCrit && ixpCrit.rawValue && !ixpCrit.rawValue.includes('unavailable')) {
        const distMatch = ixpCrit.rawValue.match(/(\d+\.?\d*)\s*miles/);
        if (distMatch) {
          const distMiles = parseFloat(distMatch[1]);
          const approxLat = coordinates.lat - (distMiles * 0.0145);
          const approxLng = coordinates.lng + (distMiles * 0.0145);
          const ixpIcon = L.divIcon({
            className: '',
            html: `<div style="
              background: #8b5cf6; color: white; font-size: 14px;
              width: 32px; height: 32px; border-radius: 8px;
              display: flex; align-items: center; justify-content: center;
              border: 2px solid white; box-shadow: 0 2px 8px rgba(139,92,246,0.5);
            ">🌐</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker([approxLat, approxLng], { icon: ixpIcon })
            .addTo(map)
            .bindPopup(`<strong>🌐 Nearest IXP</strong><br/><small>${ixpCrit.rawValue}</small>`);
        }
      }

      // Search radius circle
      L.circle([coordinates.lat, coordinates.lng], {
        radius: 5000,
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.04,
        weight: 1,
        dashArray: '6 4',
      }).addTo(map);
    };

    initMap().catch(console.error);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [coordinates?.lat, coordinates?.lng]);

  return (
    <div className="space-y-0">
      {/* Satellite rooftop image — above the interactive map */}
      {coordinates?.lat && coordinates?.lng && (
        <RooftopImage lat={coordinates.lat} lng={coordinates.lng} />
      )}
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <span>🗺️</span> Location Map
        </h3>
        <div className="flex items-center gap-3 text-xs text-slate-800 font-medium">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Location</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Substation</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-lg bg-violet-500 inline-block"></span> IXP</span>
        </div>
      </div>
      <div ref={mapRef} className="h-72 w-full" />
    </div>
    </div>
  );
}
