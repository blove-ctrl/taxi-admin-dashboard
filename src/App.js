import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxuzthjvvscppppynioz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4';
const supabase = createClient(supabaseUrl, supabaseKey);

const zoneMap = {
  '254753732': 'holding',    // TPA_HOLDING_LOT
  '306131222': 'staging',    // TPA_STAGING_LOT
  '306414626': 'blue_loading', // TPA_BLUE_LOADING
  '306414254': 'red_loading',  // TPA_RED_LOADING
  '148969187': 'exit'        // LOADING EXIT (Big Exit)
};

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLiveQueues = async () => {
      const { data: events, error } = await supabase
        .from('geofence_events')
        .select('*')
        .order('event_time', { ascending: false });

      if (error) {
        console.error('Geofence events fetch error:', error);
        setLoading(false);
        return;
      }

      const vehiclePositions = new Map();
      const latestEntries = new Map();

      events.forEach(event => {
        const vehicleId = event.vehicle_id;
        const zone = zoneMap[event.geofence_id];
        if (zone) {
          if (zone === 'exit' && vehiclePositions.has(vehicleId)) {
            vehiclePositions.delete(vehicleId);
            latestEntries.delete(vehicleId);
          } else if (event.event_type === 'GeofenceEntry') {
            const entryTime = new Date(event.event_time);
            if (!latestEntries.has(vehicleId) || latestEntries.get(vehicleId) < entryTime) {
              latestEntries.set(vehicleId, entryTime);
              vehiclePositions.set(vehicleId, {
                vehicle_name: event.vehicle_name,
                zone: zone,
                entry_time: event.event_time
              });
            }
          } else if (event.event_type === 'GeofenceExit' && vehiclePositions.has(vehicleId)) {
            const lastEntryTime = latestEntries.get(vehicleId);
            if (lastEntryTime && new Date(event.event_time) > lastEntryTime) {
              vehiclePositions.delete(vehicleId);
              latestEntries.delete(vehicleId);
            }
          }
        }
      });

      const liveVehicles = Array.from(vehiclePositions.values());
      liveVehicles.sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));
      liveVehicles.forEach((vehicle, index) => vehicle.position = index + 1);

      // Enforce combined loading capacity (max 5 across blue_loading and red_loading)
      const loadingVehicles = [
        ...liveVehicles.filter(v => v.zone === 'blue_loading'),
        ...liveVehicles.filter(v => v.zone === 'red_loading')
      ];
      if (loadingVehicles.length > 5) {
        loadingVehicles.sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time)); // Remove latest entries
        const toRemove = loadingVehicles.slice(5);
        toRemove.forEach(v => vehiclePositions.delete(v.vehicle_id));
        liveVehicles.forEach((v, index) => v.position = index + 1); // Reassign positions
      }

      // Prioritize 2 per loading zone, allow 3rd to move
      ['blue_loading', 'red_loading'].forEach(zone => {
        const zoneVehicles = liveVehicles.filter(v => v.zone === zone);
        if (zoneVehicles.length > 2) {
          const extra = zoneVehicles.slice(2);
          extra.forEach(v => console.log(`Vehicle ${v.vehicle_name} in ${zone} can move to other loading zone`));
        }
      });

      setVehicles(liveVehicles);
      setLoading(false);
    };

    fetchLiveQueues();

    const subscription = supabase
      .channel('geofence_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'geofence_events' }, () => {
        console.log('Geofence event change detected, refreshing');
        fetchLiveQueues();
      })
      .subscribe();

    const interval = setInterval(fetchLiveQueues, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const calculateWaitTime = (entryTime) => {
    const now = new Date(); // EDT
    const entry = new Date(entryTime); // UTC
    if (isNaN(entry.getTime())) {
      console.warn('Invalid entry_time:', entryTime);
      return 0;
    }
    const entryEDT = new Date(entry.getTime() + 4 * 60 * 60000); // UTC to EDT
    const diffMs = now - entryEDT;
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const vehiclesByZone = {
    holding: vehicles.filter(v => v.zone === 'holding'),
    staging: vehicles.filter(v => v.zone === 'staging'),
    blue_loading: vehicles.filter(v => v.zone === 'blue_loading'),
    red_loading: vehicles.filter(v => v.zone === 'red_loading'),
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Taxi Queue Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['holding', 'staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold capitalize">{zone.replace('_', ' ')}</h2>
            <p className="mb-2">Occupancy: {vehiclesByZone[zone].length}/{zone === 'holding' ? '∞' : 7}</p>
            <ul className="list-disc pl-5">
              {vehiclesByZone[zone].length === 0 ? (
                <li className="text-gray-500">&nbsp;</li>
              ) : (
                vehiclesByZone[zone].map(v => (
                  <li key={v.vehicle_id} className="my-1">
                    {v.vehicle_name} (#{v.position}, {calculateWaitTime(v.entry_time)} min)
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;