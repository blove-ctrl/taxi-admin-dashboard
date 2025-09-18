import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = 'https://zxuzthjvvscppppynioz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4';
const supabase = createClient(supabaseUrl, supabaseKey);

// Zone mapping
const zoneMap = {
  '254753732': 'holding',
  '306131222': 'staging',
  '306414626': 'blue_loading',
  '306414254': 'red_loading',
  '132705990': null,
  '148954116': 'blue_loading',
  '259558294': 'staging',
  '148969187': null,
  '306131799': null,
  '261253437': null
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
      const entryMap = new Map();

      events.forEach(event => {
        const vehicleId = event.vehicle_id;
        const zone = zoneMap[event.geofence_id];
        if (zone) {
          if (event.event_type === 'GeofenceEntry') {
            if (!entryMap.has(vehicleId) || entryMap.get(vehicleId).event_time < event.event_time) {
              entryMap.set(vehicleId, { event_time: event.event_time, event_id: event.event_id });
              vehiclePositions.set(vehicleId, {
                vehicle_name: event.vehicle_name,
                zone: zone,
                entry_time: event.event_time,
                event_id: event.event_id
              });
            }
          } else if (event.event_type === 'GeofenceExit') {
            const entry = entryMap.get(vehicleId);
            if (entry && new Date(event.event_time) > new Date(entry.event_time)) {
              vehiclePositions.delete(vehicleId);
              entryMap.delete(vehicleId);
            }
          }
        }
      });

      const liveVehicles = Array.from(vehiclePositions.values());
      liveVehicles.sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));
      liveVehicles.forEach((vehicle, index) => vehicle.position = index + 1);

      setVehicles(liveVehicles);
      setLoading(false);
    };

    fetchLiveQueues();

    const subscription = supabase
      .channel('geofence_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'geofence_events' }, () => {
        console.log('Geofence event change detected, refreshing queues');
        fetchLiveQueues();
      })
      .subscribe();

    const interval = setInterval(fetchLiveQueues, 30000); // Auto-refresh every 30 seconds

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [zoneMap]); // Include zoneMap in dependencies to satisfy ESLint

  const calculateWaitTime = (entryTime) => {
    const now = new Date();
    const entry = new Date(entryTime);
    if (isNaN(entry.getTime())) {
      console.warn('Invalid entry_time:', entryTime);
      return 0;
    }
    const diffMs = now - entry;
    return diffMs > 0 ? Math.floor(diffMs / 60000) : 0; // Minutes, non-negative
  };

  const vehiclesByZone = {
    holding: vehicles.filter(v => v.zone === 'holding'),
    staging: vehicles.filter(v => v.zone === 'staging'),
    blue_loading: vehicles.filter(v => v.zone === 'blue_loading'),
    red_loading: vehicles.filter(v => v.zone === 'red_loading'),
  };

  const suspendVehicle = async (vehicleName) => {
    console.log('Suspending vehicle:', vehicleName);
    // Note: This updates queues table, consider aligning with geofence logic if needed
    const { error } = await supabase
      .from('queues')
      .update({ status: 'suspended', reason: 'Admin suspension' })
      .eq('vehicle_name', vehicleName);
    if (error) console.error('Suspend error:', error);
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Taxi Queue Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['holding', 'staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold capitalize">{zone.replace('_', ' ')}</h2>
            <p className="mb-2">Occupancy: {vehiclesByZone[zone].length}/{zone === 'holding' ? '∞' : 7}</p>
            <ul className="list-disc pl-5">
              {vehiclesByZone[zone].length === 0 ? (
                <li className="text-gray-500">&nbsp;</li>
              ) : (
                vehiclesByZone[zone].map(v => (
                  <li key={v.vehicle_id} className="my-1">
                    {v.vehicle_name} (#{v.position}, {calculateWaitTime(v.entry_time)} min)
                    <button
                      onClick={() => suspendVehicle(v.vehicle_name)}
                      className="ml-2 bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                    >
                      Suspend
                    </button>
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