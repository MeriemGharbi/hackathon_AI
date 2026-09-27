export interface DamRecord {
  name: string;
  governorate: string;
  region: "North" | "Centre" | "Cap Bon";
  capacity_mm3: number;
  current_volume_mm3: number;
  fill_rate_pct: number;
  history: number[];
}

export interface DamSummaryStats {
  nationalStockMm3: number;
  threeYrAvgStockMm3: number;
  lastYearStockMm3: number;
  currentSeasonInflowMm3: number;
  previousSeasonInflowMm3: number;
  northTotalMm3: number;
  centreTotalMm3: number;
  capBonTotalMm3: number;
  meanFillPct: number;
  lastUpdateDate: string;
}

export const LATEST_DAM_STATS: DamSummaryStats = {
  nationalStockMm3: 750.69,
  threeYrAvgStockMm3: 840.77,
  lastYearStockMm3: 788.22,
  currentSeasonInflowMm3: 270.0,
  previousSeasonInflowMm3: 256.5,
  northTotalMm3: 499.88,
  centreTotalMm3: 245.25,
  capBonTotalMm3: 5.56,
  meanFillPct: 38.86,
  lastUpdateDate: "2026-08-31",
};

export const TUNISIA_DAMS: DamRecord[] = [
  {
    name: "Sidi Salem",
    governorate: "Béja",
    region: "North",
    capacity_mm3: 240.0,
    current_volume_mm3: 114.77,
    fill_rate_pct: 47.82,
    history: [25.0, 18.2, 12.0, 5.0, 14.2, 28.5, 39.4, 42.0, 40.1, 45.3, 51.0, 47.8],
  },
  {
    name: "Sejnane",
    governorate: "Bizerte",
    region: "North",
    capacity_mm3: 135.0,
    current_volume_mm3: 56.45,
    fill_rate_pct: 41.81,
    history: [42.0, 31.0, 18.5, 12.0, 24.0, 35.0, 43.0, 48.0, 46.0, 49.5, 52.1, 41.8],
  },
  {
    name: "Sidi el Barrak",
    governorate: "Béja",
    region: "North",
    capacity_mm3: 286.0,
    current_volume_mm3: 147.28,
    fill_rate_pct: 51.5,
    history: [30.1, 24.5, 19.8, 14.2, 28.1, 38.0, 45.2, 53.0, 50.1, 54.2, 58.0, 51.5],
  },
  {
    name: "Joumine",
    governorate: "Bizerte",
    region: "North",
    capacity_mm3: 127.0,
    current_volume_mm3: 31.25,
    fill_rate_pct: 24.61,
    history: [15.2, 10.4, 8.1, 3.0, 9.4, 16.2, 21.0, 28.5, 27.2, 31.0, 33.2, 24.6],
  },
  {
    name: "Bouhertma",
    governorate: "Jendouba",
    region: "North",
    capacity_mm3: 117.0,
    current_volume_mm3: 58.22,
    fill_rate_pct: 49.76,
    history: [46.2, 13.5, 21.9, 34.7, 36.9, 24.9, 42.0, 36.1, 45.4, 63.8, 41.9, 49.8],
  },
  {
    name: "Beni Mtir",
    governorate: "Jendouba",
    region: "North",
    capacity_mm3: 61.0,
    current_volume_mm3: 21.82,
    fill_rate_pct: 35.78,
    history: [35.6, 11.8, 3.0, 10.2, 27.4, 23.3, 24.8, 47.1, 42.0, 67.7, 36.6, 35.8],
  },
  {
    name: "Kasseb",
    governorate: "Béja",
    region: "North",
    capacity_mm3: 77.0,
    current_volume_mm3: 21.8,
    fill_rate_pct: 28.31,
    history: [15.7, 24.6, 15.9, 3.0, 9.0, 16.8, 34.8, 61.8, 55.2, 56.9, 49.4, 28.3],
  },
  {
    name: "Ghezala",
    governorate: "Bizerte",
    region: "North",
    capacity_mm3: 5.5,
    current_volume_mm3: 0.72,
    fill_rate_pct: 13.18,
    history: [50.2, 7.0, 3.0, 7.8, 29.8, 25.1, 29.7, 37.4, 26.2, 48.9, 61.7, 13.2],
  },
  {
    name: "Rmel",
    governorate: "Nabeul",
    region: "North",
    capacity_mm3: 3.0,
    current_volume_mm3: 0.91,
    fill_rate_pct: 30.37,
    history: [42.6, 22.6, 18.0, 26.5, 15.2, 17.5, 19.2, 27.3, 32.9, 28.8, 23.1, 30.4],
  },
  {
    name: "Ziatine",
    governorate: "Bizerte",
    region: "North",
    capacity_mm3: 85.0,
    current_volume_mm3: 31.0,
    fill_rate_pct: 36.47,
    history: [35.0, 28.2, 12.0, 3.0, 24.6, 23.0, 33.9, 52.3, 32.8, 45.0, 47.0, 36.5],
  },
  {
    name: "Tessa",
    governorate: "Béja",
    region: "North",
    capacity_mm3: 25.0,
    current_volume_mm3: 6.79,
    fill_rate_pct: 27.15,
    history: [25.3, 33.7, 3.0, 3.0, 20.2, 36.8, 15.8, 37.6, 57.0, 37.9, 43.7, 27.2],
  },
  {
    name: "Lillah",
    governorate: "Béja",
    region: "North",
    capacity_mm3: 10.0,
    current_volume_mm3: 3.74,
    fill_rate_pct: 37.42,
    history: [16.5, 17.8, 26.4, 4.2, 4.3, 8.9, 44.2, 12.9, 66.1, 74.0, 53.6, 37.4],
  },
  {
    name: "Sidi Saad",
    governorate: "Kairouan",
    region: "Centre",
    capacity_mm3: 154.0,
    current_volume_mm3: 61.48,
    fill_rate_pct: 39.92,
    history: [23.5, 16.6, 3.6, 3.0, 6.7, 34.7, 24.4, 49.2, 44.3, 45.9, 48.2, 39.9],
  },
  {
    name: "Nebhana",
    governorate: "Kairouan",
    region: "Centre",
    capacity_mm3: 63.0,
    current_volume_mm3: 22.87,
    fill_rate_pct: 36.3,
    history: [41.1, 8.5, 3.0, 11.5, 26.8, 36.8, 32.4, 32.6, 43.6, 49.5, 36.6, 36.3],
  },
  {
    name: "Hajeb El Ayoun",
    governorate: "Kairouan",
    region: "Centre",
    capacity_mm3: 32.0,
    current_volume_mm3: 9.98,
    fill_rate_pct: 31.2,
    history: [50.6, 9.1, 14.8, 29.5, 10.4, 19.6, 33.4, 37.9, 46.4, 54.6, 41.8, 31.2],
  },
  {
    name: "El Haareb",
    governorate: "Kairouan",
    region: "Centre",
    capacity_mm3: 24.0,
    current_volume_mm3: 9.85,
    fill_rate_pct: 41.02,
    history: [46.5, 16.3, 26.2, 13.9, 9.6, 3.0, 26.9, 43.0, 59.5, 48.5, 36.0, 41.0],
  },
  {
    name: "Nailia",
    governorate: "Sidi Bouzid",
    region: "Centre",
    capacity_mm3: 7.0,
    current_volume_mm3: 3.1,
    fill_rate_pct: 44.3,
    history: [22.1, 23.4, 3.0, 7.0, 3.0, 13.7, 37.0, 41.3, 34.5, 68.3, 58.5, 44.3],
  },
  {
    name: "Bir M'cherga",
    governorate: "Zaghouan",
    region: "Centre",
    capacity_mm3: 40.0,
    current_volume_mm3: 10.37,
    fill_rate_pct: 25.92,
    history: [14.6, 30.0, 13.2, 6.5, 19.5, 36.6, 24.3, 47.5, 48.4, 40.5, 45.8, 25.9],
  },
  {
    name: "Lebna",
    governorate: "Nabeul",
    region: "Centre",
    capacity_mm3: 22.0,
    current_volume_mm3: 12.3,
    fill_rate_pct: 55.93,
    history: [29.7, 9.4, 17.6, 3.0, 39.2, 20.7, 40.5, 33.8, 57.3, 50.3, 68.4, 55.9],
  },
  {
    name: "Siliana",
    governorate: "Siliana",
    region: "Centre",
    capacity_mm3: 60.0,
    current_volume_mm3: 22.69,
    fill_rate_pct: 37.82,
    history: [6.8, 36.9, 20.7, 20.6, 3.0, 9.0, 13.8, 45.2, 51.6, 39.1, 44.9, 37.8],
  },
  {
    name: "Mellègue",
    governorate: "Le Kef",
    region: "Centre",
    capacity_mm3: 197.0,
    current_volume_mm3: 77.28,
    fill_rate_pct: 39.23,
    history: [31.9, 15.8, 14.5, 9.1, 14.7, 14.9, 31.5, 35.9, 47.9, 32.2, 37.1, 39.2],
  },
  {
    name: "Sarrat",
    governorate: "Le Kef",
    region: "Centre",
    capacity_mm3: 21.0,
    current_volume_mm3: 9.97,
    fill_rate_pct: 47.5,
    history: [26.2, 18.7, 8.0, 7.8, 31.4, 31.1, 53.3, 47.9, 57.6, 40.7, 27.4, 47.5],
  },
  {
    name: "El Aroussa",
    governorate: "Siliana",
    region: "Centre",
    capacity_mm3: 8.0,
    current_volume_mm3: 3.34,
    fill_rate_pct: 41.8,
    history: [22.4, 10.0, 3.0, 48.3, 13.5, 27.6, 18.0, 46.4, 13.2, 47.6, 24.0, 41.8],
  },
  {
    name: "Bargou",
    governorate: "Siliana",
    region: "Centre",
    capacity_mm3: 4.0,
    current_volume_mm3: 2.02,
    fill_rate_pct: 50.44,
    history: [8.9, 3.0, 13.4, 13.6, 19.8, 18.1, 21.9, 27.8, 53.7, 42.8, 26.6, 50.4],
  },
  {
    name: "Chiba",
    governorate: "Nabeul",
    region: "Cap Bon",
    capacity_mm3: 6.0,
    current_volume_mm3: 2.55,
    fill_rate_pct: 42.45,
    history: [34.2, 29.6, 3.0, 3.0, 3.0, 16.6, 36.2, 52.0, 37.7, 39.7, 48.8, 42.4],
  },
  {
    name: "Wadi El Hajar",
    governorate: "Nabeul",
    region: "Cap Bon",
    capacity_mm3: 2.0,
    current_volume_mm3: 0.63,
    fill_rate_pct: 31.65,
    history: [21.6, 27.8, 3.0, 4.9, 19.6, 16.3, 32.2, 32.6, 23.6, 31.1, 51.7, 31.6],
  },
  {
    name: "Masri",
    governorate: "Nabeul",
    region: "Cap Bon",
    capacity_mm3: 5.5,
    current_volume_mm3: 2.38,
    fill_rate_pct: 43.34,
    history: [14.0, 15.6, 17.6, 23.8, 12.2, 9.9, 34.2, 48.7, 51.7, 47.0, 26.6, 43.3],
  },
];

export function getDamStatusForGovernorate(govName: string) {
  const normalized = govName.toLowerCase().replace("le ", "").trim();
  const directDams = TUNISIA_DAMS.filter(
    (d) => d.governorate.toLowerCase().replace("le ", "").trim() === normalized
  );

  if (directDams.length > 0) {
    const worst = [...directDams].sort((a, b) => a.fill_rate_pct - b.fill_rate_pct)[0];
    return {
      worst_dam_name: worst.name,
      per_dam_fill_pct: worst.fill_rate_pct,
      capacity_mm3: worst.capacity_mm3,
      current_volume_mm3: worst.current_volume_mm3,
      region: worst.region,
    };
  }

  return {
    worst_dam_name: "Regional Reservoirs",
    per_dam_fill_pct: LATEST_DAM_STATS.meanFillPct,
    capacity_mm3: 50.0,
    current_volume_mm3: (50.0 * LATEST_DAM_STATS.meanFillPct) / 100,
    region: "Centre" as const,
  };
}
