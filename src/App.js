import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxuzthjvvscppppynioz.supabase.co';
const supabaseKey = '<PUBLIC_ANON_KEY>'; // keep this anon; never service_role in browser
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchLiveQueues = async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('*')
        .eq('status', 'active')
        .order('zone', { ascending: true })
        .order('position', { ascending: true });

      if (!isMounted) return;
      if (error) {
        console.error('Queues fetch error:', error);
      } else {
        setVehicles(data || []);
      }
      setLoading(false);
    };

    fetchLiveQueues();

    const channel = supabase
      .channel('queues-active')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queues', filter: 'status=eq.active' },
        () => fetchLiveQueues()
      )
      .subscribe();

    const interval = setInterval(fetchLiveQueues, 30000);

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const calculateWaitTime = (entryTime) => {
    const now = new Date();
    const entry = new Date(entryTime);
    if (isNaN(entry)) return 0;
    const diffMs = now - entry;
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
            <p className="mb-2">
              Occupancy: {vehiclesByZone[zone].length}/{zone === 'holding' ? '∞' : 7}
            </p>
            <ul className="list-disc pl-5 min-h-6">
              {vehiclesByZone[zone].length === 0 ? (
                <li className="text-gray-500">No vehicles</li>
              ) : (
                vehiclesByZone[zone].map(v => (
                  <li key={v.id} className="my-1">
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
