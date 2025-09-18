import { useState, useEffect } from 'react';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zxuzthjvvscppppynioz.supabase.co';

const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4';

const supabase = createClient(supabaseUrl, supabaseKey);

function App() {

  const [queues, setQueues] = useState([]);

  const [capacities, setCapacities] = useState({ holding: 8, staging: 7, blue_loading: 2, red_loading: 3 });

  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Fetch initial data

    const fetchData = async () => {

      const { data: queuesData, error: queuesError } = await supabase

        .from('queues')

        .select('*')

        .eq('status', 'active')

        .order('zone')

        .order('position');

      const { data: capacitiesData, error: capacitiesError } = await supabase

        .from('config')

        .select('*');

      if (queuesError) console.error('Queues fetch error:', queuesError);

      if (capacitiesError) console.error('Capacities fetch error:', capacitiesError);

      setQueues(queuesData || []);

      setCapacities(capacitiesData.reduce((acc, item) => {

        acc[item.key] = item.value;

        return acc;

      }, { holding: 8, staging: 7, blue_loading: 2, red_loading: 3 }));

      setLoading(false);

    };

    fetchData();

    // Realtime subscription

    const subscription = supabase

      .channel('queues')

      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, payload => {

        console.log('Realtime change:', payload);

        fetchData(); // Refetch to ensure consistency

      })

      .subscribe();

    // Auto-refresh every 30 seconds

    const interval = setInterval(fetchData, 30000);

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

  const queuesByZone = {

    holding: queues.filter(q => q.zone === 'holding'),

    staging: queues.filter(q => q.zone === 'staging'),

    blue_loading: queues.filter(q => q.zone === 'blue_loading'),

    red_loading: queues.filter(q => q.zone === 'red_loading'),

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

            <p>Occupancy: {queuesByZone[zone].length}/{capacities[zone]}</p>

            <ul>

              {queuesByZone[zone].map(q => (

                <li key={q.id} className="my-2">

                  {q.vehicle_name} (#{q.position}, {calculateWaitTime(q.entry_time)} min)

                  <button onClick={() => suspendVehicle(q.vehicle_name)} className="ml-2 bg-red-500 text-white px-2 py-1 rounded">

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