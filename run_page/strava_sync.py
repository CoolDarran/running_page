import argparse
import json

from config import JSON_FILE, SQL_FILE
from generator import Generator


# for only run type, we use the same logic as garmin_sync
def run_strava_sync(
    client_id,
    client_secret,
    refresh_token,
    sync_types: list = [],
    only_run=False,
    backfill_details=False,
    backfill_since_year=2025,
    backfill_limit=40,
):
    generator = Generator(SQL_FILE)
    generator.set_strava_config(client_id, client_secret, refresh_token)
    # judge sync types is only running or not
    if not only_run and len(sync_types) == 1 and sync_types[0] == "running":
        only_run = True
    # if you want to refresh data change False to True
    generator.only_run = only_run
    generator.sync(False)
    if backfill_details:
        generator.backfill_strava_details(
            since_year=backfill_since_year,
            max_activities=backfill_limit,
        )

    activities_list = generator.loadForMapping()
    with open(JSON_FILE, "w") as f:
        json.dump(activities_list, f, indent=0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("client_id", help="strava client id")
    parser.add_argument("client_secret", help="strava client secret")
    parser.add_argument("refresh_token", help="strava refresh token")
    parser.add_argument(
        "--only-run",
        dest="only_run",
        action="store_true",
        help="if is only for running",
    )
    parser.add_argument(
        "--backfill-details",
        dest="backfill_details",
        action="store_true",
        help="backfill hr_zones, suffer_score, subtype, and elapsed_time for historical Strava activities",
    )
    parser.add_argument(
        "--backfill-since-year",
        dest="backfill_since_year",
        type=int,
        default=2025,
        help="earliest year to backfill when --backfill-details is set (default: 2025)",
    )
    parser.add_argument(
        "--backfill-limit",
        dest="backfill_limit",
        type=int,
        default=40,
        help="max historical activities to backfill per run to respect Strava rate limits (default: 40)",
    )
    options = parser.parse_args()
    run_strava_sync(
        options.client_id,
        options.client_secret,
        options.refresh_token,
        only_run=options.only_run,
        backfill_details=options.backfill_details,
        backfill_since_year=options.backfill_since_year,
        backfill_limit=options.backfill_limit,
    )
