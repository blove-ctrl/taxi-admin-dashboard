import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

const supabase = createClient('https://zxuzthjvvscppppynioz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc6MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4');

function App() {
  const [queues, setQueues] = useState({});
  const [capacities, setCapacities] = useState({ holding: Infinity, staging: 7, blue_loading: 2, red_loading: 3 });

  useEffect(() => {
    fetchQueues();
    const queueSubscription = supabase
      .channel('queues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, payload => {
        fetchQueues();
      })
      .subscribe();

    const configSubscription = supabase
      .channel('config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, payload => {
        fetchCapacities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(queueSubscription);
      supabase.removeChannel(configSubscription);
    };
  }, []);

  async function fetchQueues() {
    const { data, error } = await supabase
      .from('queues')
      .select('*')
      .eq('status', 'active')
      .order('zone')
      .order('position');
    if (error) console.error('Error fetching queues:', error);
    else {
      const grouped = data.reduce((acc, q) => {
        acc[q.zone] = acc[q.zone] || [];
        acc[q.zone].push(q);
        return acc;
      }, {});
      setQueues(grouped);
    }
  }

  async function fetchCapacities() {
    const { data, error } = await supabase.from('config').select('key,value');
    if (error) console.error('Error fetching capacities:', error);
    else {
      const caps = { holding: Infinity, staging: 7, blue_loading: 2, red_loading: 3 };
      data.forEach(item => {
        if (item.key === 'staging_capacity') caps.staging = item.value;
        if (item.key === 'blue_loading_capacity') caps.blue_loading = item.value;
        if (item.key === 'red_loading_capacity') caps.red_loading = item.value;
      });
      setCapacities(caps);
    }
  }

  async function suspendVehicle(vehicleName) {
    const { error } = await supabase
      .from('queues')
      .update({ status: 'suspended', reason: 'Admin suspension' })
      .eq('vehicle_name', vehicleName);
    if (error) console.error('Error suspending vehicle:', error);
    else alert('Vehicle suspended');
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Taxi Queue Dashboard</h1>
      {['holding', 'staging', 'blue_loading', 'red_loading'].map(zone => (
        <div key={zone} className="mb-6">
          <h2 className="text-xl font-semibold">{zone.charAt(0).toUpperCase() + zone.slice(1)}</h2>
          <p>Occupancy: {queues[zone]?.length || 0}/{capacities[zone]}</p>
          <ul className="list-disc pl-5">
            {queues[zone]?.map(q => (
              <li key={q.vehicle_name} className="my-2">
                {q.vehicle_name} (#{q.position}, {Math.floor((new Date() - new Date(q.entry_time)) / 60000)} min)
                <button
                  onClick={() => suspendVehicle(q.vehicle_name)}
                  className="ml-2 bg-red-500 text-white p-1 rounded"
                >
                  Suspend
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-6">
        <h2 className="text-xl font-semibold">Adjust Capacities</h2>
        {['staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="my-2">
            {zone} Capacity:
            <input
              type="number"
              min="1"
              defaultValue={capacities[zone]}
              onBlur={async (e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value > 0) {
                  await supabase
                    .from('config')
                    .upsert({ key: `${zone}_capacity`, value }, { onConflict: 'key' });
                  fetchCapacities();
                }
              }}
              className="ml-2 p-1 border rounded"
            />
            <button
              onClick={async () => {
                const value = parseInt(prompt(`New capacity for ${zone}:`, capacities[zone]));
                if (!isNaN(value) && value > 0) {
                  await supabase
                    .from('config')
                    .upsert({ key: `${zone}_capacity`, value }, { onConflict: 'key' });
                  fetchCapacities();
                }
              }}
              className="ml-2 bg-blue-500 text-white p-1 rounded"
            >
              Update
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;