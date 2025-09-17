import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const supabase = createClient('https://zxuzthjvvscppppynioz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4');

function App() {
  const [queues, setQueues] = useState([]);
  const [capacities, setCapacities] = useState({ staging: 7, blue_loading: 2, red_loading: 3 });
  const [newCapacities, setNewCapacities] = useState({ staging: 7, blue_loading: 2, red_loading: 3 });
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) navigate('/login');
    };
    checkSession();

    const fetchQueues = async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('vehicle_name, zone, position, entry_time, status, reason')
        .eq('status', 'active')
        .order('position', { ascending: true });
      if (error) console.error('Error fetching queues:', error.message);
      else setQueues(data || []);
    };
    fetchQueues();

    const fetchCapacities = async () => {
      const { data, error } = await supabase.from('config').select('key, value');
      if (error) console.error('Error fetching capacities:', error.message);
      else {
        const updated = { staging: 7, blue_loading: 2, red_loading: 3 };
        data.forEach(item => {
          if (item.key === 'staging_capacity') updated.staging = item.value;
          if (item.key === 'blue_loading_capacity') updated.blue_loading = item.value;
          if (item.key === 'red_loading_capacity') updated.red_loading = item.value;
        });
        setCapacities(updated);
        setNewCapacities(updated);
      }
    };
    fetchCapacities();

    const queueSubscription = supabase
      .channel('queues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queues' }, payload => {
        console.log('Realtime update for queues:', payload);
        fetchQueues();
      })
      .subscribe();

    const configSubscription = supabase
      .channel('config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, payload => {
        console.log('Realtime update for config:', payload);
        fetchCapacities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(queueSubscription);
      supabase.removeChannel(configSubscription);
    };
  }, [navigate]);

  const handleCapacityChange = async (zone, value) => {
    if (!Number.isInteger(value) || value < 1) {
      alert('Capacity must be a positive integer');
      return;
    }
    try {
      const response = await fetch('https://taxi-webhook-server.onrender.com/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `${zone}_capacity`, value })
      });
      if (!response.ok) throw new Error('Failed to update capacity');
      setNewCapacities(prev => ({ ...prev, [zone]: value }));
      alert('Capacity updated successfully');
    } catch (error) {
      console.error('Error updating capacity:', error);
      alert('Failed to update capacity');
    }
  };

  const suspendVehicle = async (vehicleName) => {
    console.log('Attempting to suspend vehicle:', vehicleName);
    try {
      const { data, error } = await supabase
        .from('queues')
        .update({ status: 'suspended', reason: 'Admin suspension' })
        .eq('vehicle_name', vehicleName)
        .select();
      if (error) throw error;
      console.log('Suspension successful, updated rows:', data);
      alert('Vehicle suspended');
    } catch (error) {
      console.error('Error suspending vehicle:', error.message, error.details);
      alert('Failed to suspend vehicle: ' + error.message);
    }
  };

  const calculateWaitTime = (entryTime) => {
    const now = new Date();
    const entry = new Date(entryTime);
    const diffMs = now - entry;
    return diffMs > 0 ? Math.floor(diffMs / 60000) : 0; // Minutes, non-negative
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Taxi Queue Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['holding', 'staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="p-4 bg-white rounded shadow">
            <h2 className="text-xl font-semibold capitalize">{zone.replace('_', ' ')}</h2>
            <p>Occupancy: {queues.filter(q => q.zone === zone).length}/{zone === 'holding' ? '∞' : capacities[zone]}</p>
            <ul>
              {queues.filter(q => q.zone === zone).map(q => (
                <li key={q.vehicle_name} className="my-2">
                  {q.vehicle_name} (#{q.position}, {calculateWaitTime(q.entry_time)} min)
                  <button
                    onClick={() => suspendVehicle(q.vehicle_name)}
                    className="ml-2 bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                  >
                    Suspend
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <h2 className="text-xl font-semibold">Adjust Capacities</h2>
        {['staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="mt-2 flex items-center">
            <label className="capitalize mr-2">{zone.replace('_', ' ')} Capacity:</label>
            <input
              type="number"
              min="1"
              value={newCapacities[zone]}
              onChange={e => setNewCapacities(prev => ({ ...prev, [zone]: parseInt(e.target.value) || 1 }))}
              className="border p-1 w-16 mr-2"
            />
            <button
              onClick={() => handleCapacityChange(zone, newCapacities[zone])}
              className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
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