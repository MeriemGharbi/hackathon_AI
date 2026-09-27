"""CLI / debug entry point for the AgriRisk dam service.

The implementation lives in `agrisk.services.dam` so the dashboard, the AI
Risk Analyst chat and this script all share exactly one code path.
"""

from agrisk.services.dam import (
    GET_DAM_STATUS_SCHEMA,
    REGION_TOTAL_COLUMN,
    available_governorates,
    dam_data_coverage,
    fix_mojibake,
    get_dam_dataframe,
    get_dam_status,
    get_water_indicators,
    load_dam_data,
    normalize_governorate,
)

# Backwards-compatible module attribute (loaded lazily by the service)
DAM_DF = get_dam_dataframe()


if __name__ == "__main__":
    print("Unique governorates after cleaning:", available_governorates())
    print("Coverage:", dam_data_coverage())
    print()
    print(get_dam_status("Béja"))
    print(get_dam_status("béja"))      # should match the same row despite different casing/accent input
    print(get_dam_status("BÃ©ja"))     # should also resolve correctly if mojibake sneaks into a live query
    print(get_water_indicators("Kairouan"))
