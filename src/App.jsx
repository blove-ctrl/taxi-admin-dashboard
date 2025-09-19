import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** ======= CONFIG ======= */
const SUPABASE_URL = "https://zxuzthjvvscppppynioz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODAxNzYwMiwiZXhwIjoyMDczNTkzNjAyfQ.B4Vvd7SqPUXjv5l2SNOsRnisV-fdS9IP8AAFN5w3A9I"; // never service_role in the browser

const ZONES = ["holding", "staging", "blue_loading", "red_loading"];
const CAPACITY = { holding: Infinity, staging: 7, blue_loading: 7, red_loading: 7 };
/** ====================== */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchActive = async () => {
      const { data, error } = await supabase
        .from("queues")
        .select("id, vehicle_id, vehicle_name, zone, status, position, entry_time")
        .eq("status", "active")
        .order("zone", { ascending: true })
        .order("position", { ascending: true });

      if (!mounted) return;
      if (error) {
        console.error("Supabase fetch error:", error);
        setErrMsg(error.message ?? "Error loading data");
      } else {
        setRows(data ?? []);
        setErrMsg("");
      }
      setLoading(false);
    };

    fetchActive();

    // Realtime: refetch on any change to active rows
    const channel = supabase
      .channel("queues-active")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queues", filter: "status=eq.active" },
        fetchActive
      )
      .subscribe();

    // Gentle polling as a safety net (optional)
    const interval = setInterval(fetchActive, 30_000);

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const vehiclesByZone = useMemo(() => {
    const map = Object.fromEntries(ZONES.map((z) => [z, []]));
    for (const r of rows) {
      if (map[r.zone]) map[r.zone].push(r);
    }
    return map;
  }, [rows]);

  const waitMins = (iso) => {
    const t = new Date(iso);
    if (isNaN(t.getTime())) return 0;
    const diffMs = Date.now() - t.getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Taxi Queue Dashboard</h1>

      {errMsg && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ZONES.map((zone) => (
          <div key={zone} className="p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold capitalize">
              {zone.replaceAll("_", " ")}
            </h2>
            <p className="mb-2">
              Occupancy: {vehiclesByZone[zone].length}/
              {CAPACITY[zone] === Infinity ? "∞" : CAPACITY[zone]}
            </p>

            <ul className="list-disc pl-5">
              {vehiclesByZone[zone].length === 0 ? (
                <li className="text-gray-500">No vehicles</li>
              ) : (
                vehiclesByZone[zone].map((v) => (
                  <li key={v.id ?? `${v.vehicle_id}-${v.entry_time}`} className="my-1">
                    {v.vehicle_name} (#{v.position}, {waitMins(v.entry_time)} min)
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
