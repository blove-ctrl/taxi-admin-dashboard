import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxuzthjvvscppppynioz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4';
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [capacities, setCapacities] = useState({ holding: Infinity, staging: 7, blue_loading: 2, red_loading: 3 });
  const [loading, setLoading] = useState(true);

  const zoneMap = {
    '254753732': 'holding',
    '306131222': 'staging',
    '306414626': 'blue_loading',
    '306414254': 'red_loading',
    '132705990': null, // Ignored
    '148954116': 'blue_loading',
    '259558294': 'staging',
    '148969187': null, // Ignored
    '306131799': null, // Ignored
    '261253437': null // Ignored
  };

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

      // Reconstruct current positions from events
      const vehiclePositions = {};
      const processedEntries = new Set();
      events.forEach(event => {
        const vehicleId = event.vehicle_id;
        const zone = zoneMap[event.geofence_id];
        if (zone && event.event_type === 'GeofenceEntry' && !processedEntries.has(`${vehicleId}-${event.event_id}`)) {
          if (!vehiclePositions[vehicleId] || vehiclePositions[vehicleId].entry_time < event.event_time) {
            vehiclePositions[vehicleId] = {
              vehicle_name: event.vehicle_name,
              zone: zone,
              entry_time: event.event_time,
              event_id: event.event_id
            };
            processedEntries.add(`${vehicleId}-${event.event_id}`);
          }
        } else if (zone && event.event_type === 'GeofenceExit' && vehiclePositions[vehicleId] && vehiclePositions[vehicleId].event_id === event.event_id) {
          delete vehiclePositions[vehicleId]; // Exit removes from zone
        }
      });

      const liveVehicles = Object.values(vehiclePositions);
      liveVehicles.sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time)); // Earlier entries first
      liveVehicles.forEach((vehicle, index) => vehicle.position = index + 1);

      setVehicles(liveVehicles);
      setLoading(false);
    };

    fetchLiveQueues();

    // Realtime subscription on geofence_events
    const subscription = supabase
      .channel('geofence_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'geofence_events' }, () => {
        console.log('Geofence event change detected, refreshing queues');
        fetchLiveQueues();
      })
      .subscribe();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchLiveQueues, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const calculateWaitTime = (entryTime) => {
    const now = new Date();
    const entry = new Date(entryTime);
    if (isNaN(entry.getTime())) return 0;
    const diffMs = now - entry;
    return Math.floor(diffMs / 60000);
  };

  const vehiclesByZone = {
    holding: vehicles.filter(v => v.zone === 'holding'),
    staging: vehicles.filter(v => v.zone === 'staging'),
    blue_loading: vehicles.filter(v => v.zone === 'blue_loading'),
    red_loading: vehicles.filter(v => v.zone === 'red_loading'),
  };

  const suspendVehicle = async (vehicleName) => {
    console.log('Suspending vehicle:', vehicleName);
    const { error } = await supabase
      .from('queues')
      .update({ status: 'suspended', reason: 'Admin suspension' })
      .eq('vehicle_name', vehicleName);
    if (error) console.error('Suspend error:', error);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Taxi Queue Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['holding', 'staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="p-4 bg-white rounded shadow">
            <h2 className="text-xl font-semibold capitalize">{zone.replace('_', ' ')}</h2>
            <p>Occupancy: {vehiclesByZone[zone].length}/{capacities[zone] === Infinity ? '∞' : capacities[zone]}</p>
            <ul>
              {vehiclesByZone[zone].map(v => (
                <li key={v.vehicle_id} className="my-2">
                  {v.vehicle_name} (#{v.position}, {calculateWaitTime(v.entry_time)} min)
                  <button onClick={() => suspendVehicle(v.vehicle_name)} className="ml-2 bg-red-500 text-white px-2 py-1 rounded">
                    Suspend
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;