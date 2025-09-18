import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxuzthjvvscppppynioz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4';
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLiveQueues = async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('*')
        .eq('status', 'active')
        .order('zone')
        .order('position');

      if (error) {
        console.error('Queues fetch error:', error);
        setLoading(false);
        return;
      }

      setVehicles(data || []);
      setLoading(false);
    };

    fetchLiveQueues();

    const subscription = supabase
      .channel('queues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, () => {
        console.log('Queue change detected, refreshing');
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