import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import './App.css';

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
        .select('vehicle_name,zone,position,entry_time,status,reason')
        .eq('status', 'active')
        .order('position', { ascending: true });
      if (error) console.error('Error fetching queues:', error);
      else setQueues(data);
    };
    fetchQueues();

    const fetchCapacities = async () => {
      const { data, error } = await supabase.from('config').select('key,value');
      if (error) console.error('Error fetching capacities:', error);
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
  }, [navigate]);

  const handleCapacityChange = async (zone, value) => {
    if (!Number.isInteger(value) || value < 1) {
      alert('Invalid capacity');
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
    } catch (error) {
      console.error('Error updating capacity:', error);
      alert('Failed to update capacity');
    }
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
                <li key={q.vehicle_name}>
                  {q.vehicle_name} (#{q.position}, {Math.floor((new Date() - new Date(q.entry_time)) / 60000)} min)
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <h2 className="text-xl font-semibold">Adjust Capacities</h2>
        {['staging', 'blue_loading', 'red_loading'].map(zone => (
          <div key={zone} className="mt-2">
            <label className="capitalize">{zone.replace('_', ' ')} Capacity:</label>
            <input
              type="number"
              min="1"
              value={newCapacities[zone]}
              onChange={e => setNewCapacities(prev => ({ ...prev, [zone]: parseInt(e.target.value) || 1 }))}
              className="ml-2 border p-1"
            />
            <button
              onClick={() => handleCapacityChange(zone, newCapacities[zone])}
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