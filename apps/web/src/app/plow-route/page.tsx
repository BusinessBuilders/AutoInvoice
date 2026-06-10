'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

interface PlowStop {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
}

// Default route order - can be customized
const DEFAULT_ORDER = [
  '10 brookside',
  '11 brookside',
  'laurel hill',
  '301 bullard',
  'mark bradford',
  'wyndhu',  // matches wyndhurst or wyndhurtst
  'highland',
  '2356 main',
  '301 main',
  'maple springs',
  'prospect',
  '104 main',
];

export default function PlowRoutePage() {
  const [stops, setStops] = useState<PlowStop[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Get plow customers - public endpoint, no auth required
  const { data: plowCustomers, isLoading } = trpc.customer.getPlowRoute.useQuery();

  useEffect(() => {
    if (plowCustomers) {
      // Sort by default order
      const sorted = [...plowCustomers].sort((a, b) => {
        const aIndex = DEFAULT_ORDER.findIndex(pattern =>
          a.address.toLowerCase().includes(pattern)
        );
        const bIndex = DEFAULT_ORDER.findIndex(pattern =>
          b.address.toLowerCase().includes(pattern)
        );
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      setStops(sorted);
    }
  }, [plowCustomers]);

  const moveStop = (fromIndex: number, toIndex: number) => {
    const newStops = [...stops];
    const [moved] = newStops.splice(fromIndex, 1);
    newStops.splice(toIndex, 0, moved);
    setStops(newStops);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      moveStop(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const generateRouteUrl = (routeStops: PlowStop[], startFromLocation: boolean = true) => {
    if (routeStops.length === 0) return '';

    const formatAddress = (stop: PlowStop) =>
      `${stop.address}, ${stop.city}, ${stop.state}`.replace(/\s+/g, '+');

    const origin = startFromLocation ? 'My+Location' : formatAddress(routeStops[0]);
    const destination = formatAddress(routeStops[routeStops.length - 1]);

    const waypointStops = startFromLocation
      ? routeStops.slice(0, -1)
      : routeStops.slice(1, -1);

    const waypoints = waypointStops
      .map(stop => formatAddress(stop))
      .join('%7C');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving&dir_action=navigate`;

    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }

    return url;
  };

  // Split into chunks - max 8 stops per route to stay under Google's 10 waypoint limit
  const getRouteChunks = () => {
    const maxStopsPerRoute = 8;

    if (stops.length <= maxStopsPerRoute) {
      return [stops];
    }

    // Split into two routes: Holden first, then Rutland
    const holdenStops = stops.filter(s =>
      s.city.toLowerCase().includes('holden')
    );
    const rutlandStops = stops.filter(s =>
      s.city.toLowerCase().includes('rutland')
    );
    const otherStops = stops.filter(s =>
      !s.city.toLowerCase().includes('holden') &&
      !s.city.toLowerCase().includes('rutland')
    );

    // Combine: Holden + others first, then Rutland
    const route1 = [...holdenStops, ...otherStops.slice(0, Math.max(0, maxStopsPerRoute - holdenStops.length))];
    const route2 = [...otherStops.slice(Math.max(0, maxStopsPerRoute - holdenStops.length)), ...rutlandStops];

    const chunks = [];
    if (route1.length > 0) chunks.push(route1);
    if (route2.length > 0) chunks.push(route2);

    return chunks;
  };

  const routeChunks = getRouteChunks();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/plow-billing" className="text-gray-500 hover:text-gray-700">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">🚜 Plow Route</h1>
            </div>
            <span className="text-sm text-gray-500">{stops.length} stops</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Drag to reorder stops. Click "Start Navigation" when ready.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Route Buttons */}
        <div className="mb-6 space-y-3">
          {routeChunks.length === 1 ? (
            <a
              href={generateRouteUrl(stops)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-6 py-4 bg-green-600 text-white rounded-lg text-lg font-bold hover:bg-green-700 shadow-lg"
            >
              🚗 Start Navigation ({stops.length} stops)
            </a>
          ) : (
            <>
              <p className="text-sm text-amber-600 font-medium">
                ⚠️ Route split into {routeChunks.length} parts (Google Maps 10-stop limit)
              </p>
              {routeChunks.map((chunk, i) => (
                <a
                  key={i}
                  href={generateRouteUrl(chunk, i === 0)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full text-center px-6 py-3 rounded-lg font-bold shadow ${
                    i === 0
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {i === 0 ? '🚗 Start' : '➡️ Continue'} Route Part {i + 1} ({chunk.length} stops)
                </a>
              ))}
            </>
          )}
        </div>

        {/* Stop List */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-700">Route Order</h2>
          </div>
          <ul className="divide-y">
            {stops.map((stop, index) => (
              <li
                key={stop.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-3 flex items-center gap-3 cursor-move hover:bg-gray-50 ${
                  draggedIndex === index ? 'bg-blue-50' : ''
                }`}
              >
                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-bold text-sm">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{stop.name}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {stop.address}, {stop.city}
                  </p>
                </div>
                <span className="text-gray-300 text-lg">⠿</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => {
              const text = stops.map((s, i) => `${i + 1}. ${s.name} - ${s.address}, ${s.city}`).join('\n');
              navigator.clipboard.writeText(text);
              alert('Route copied to clipboard!');
            }}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            📋 Copy List
          </button>
          <button
            onClick={() => {
              const url = generateRouteUrl(stops);
              navigator.clipboard.writeText(url);
              alert('Route URL copied!');
            }}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            🔗 Copy URL
          </button>
        </div>
      </main>
    </div>
  );
}
