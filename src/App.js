// src/App.js
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** ======= SUPABASE (CLIENT) ======= */
const SUPABASE_URL = "https://zxuzthjvvscppppynioz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dXp0aGp2dnNjcHBwcHluaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTc2MDIsImV4cCI6MjA3MzU5MzYwMn0.16AwInQgpJoFerd4g4SRGIuNFov-xJyxZZMs6COL-D4"; // public anon key (OK in browser)

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
/** ================================= */

const ZONES = ["holding", "staging", "blue_loading", "red_loading"];
const CAPACITY = { holding: Infinity, staging: 7, blue_loading: 7, red_loading: 7 };

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  // re-render every minute so wait times stay fresh
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

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

    // Realtime refetch on changes to active rows
    const channel = supabase
      .channel("queues-active")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queues", filter: "status=eq.active" },
        fetchActive
      )
      .subscribe();

    // Safety net polling
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

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4 text-center">Taxi Queue Dashboard</h1>

      {errMsg && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{errMsg}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ZONES.map((zone) => (
          <div key={zone} className="p-4 bg-white rounded-lg shadow">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-semibold capitalize">
                {zone.replaceAll("_", " ")}
              </h2>
              <span
                className={[
                  "text-xs px-2 py-1 rounded-full",
                  Number.isFinite(CAPACITY[zone]) &&
                  vehiclesByZone[zone].length > CAPACITY[zone]
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700",
                ].join(" ")}
              >
                {Number.isFinite(CAPACITY[zone])
                  ? `${vehiclesByZone[zone].length}/${CAPACITY[zone]}`
                  : "∞"}
              </span>
            </div>

            {Number.isFinite(CAPACITY[zone]) && (
              <div className="w-full h-2 bg-gray-100 rounded mb-3 overflow-hidden">
                <div
                  className={
                    vehiclesByZone[zone].length > CAPACITY[zone]
                      ? "h-2 bg-red-400"
                      : "h-2 bg-green-400"
                  }
                  style={{
                    width: `${Math.min(
                      100,
                      (vehiclesByZone[zone].length / CAPACITY[zone]) * 100
                    )}%`,
                    transition: "width 200ms linear",
                  }}
                />
              </div>
            )}

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

            {Number.isFinite(CAPACITY[zone]) &&
              vehiclesByZone[zone].length > CAPACITY[zone] && (
                <p className="mt-2 text-sm text-red-600">
                  Over capacity by {vehiclesByZone[zone].length - CAPACITY[zone]}.
                </p>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}

