import math
import datetime

import svgwrite

from .exceptions import PosterError
from .tracks_drawer import TracksDrawer
from .utils import format_float, interpolate_color
from .value_range import ValueRange
from .xy import XY


class MonthOfLifeDrawer(TracksDrawer):
    """Draw a Month of Life poster with 1000 months as circles"""

    def __init__(self, the_poster):
        super().__init__(the_poster)
        self.birth_year = None
        self.birth_month = None

    def create_args(self, args_parser):
        # Add argument for birth date
        args_parser.add_argument(
            "--birth",
            dest="birth",
            metavar="YYYY-MM",
            type=str,
            default=None,
            help="Birth date in format YYYY-MM",
        )

    def fetch_args(self, args):
        # Parse birth date
        if args.type == "monthoflife":
            if not args.birth:
                raise PosterError(
                    "Birth date parameter --birth is required in format YYYY-MM"
                )
            try:
                parts = args.birth.split("-")
                self.birth_year = int(parts[0])
                self.birth_month = int(parts[1])
                if not (1 <= self.birth_month <= 12):
                    raise ValueError
            except Exception:
                raise PosterError("Invalid birth date format, must be YYYY-MM")

    def draw(self, dr: svgwrite.Drawing, size: XY, offset: XY):
        if self.poster.tracks is None:
            raise PosterError("No tracks to draw")
        # If all tracks have zero distance (e.g. Workout), fall back to duration
        # (in seconds) as the per-month metric so circles get colored.
        use_duration = all(tr.length == 0 for tr in self.poster.tracks)
        total_months = 1200
        # calculate grid: columns and rows
        cols = max(1, int(size.x / size.y * math.sqrt(total_months)))
        rows = math.ceil(total_months / cols)
        spacing_x = size.x / cols
        spacing_y = size.y / rows
        radius = min(spacing_x, spacing_y) / 2 * 0.85
        # prepare per-month metric (distance in meters, or duration in seconds)
        month_values = []
        for idx in range(total_months):
            y = self.birth_year + (self.birth_month - 1 + idx) // 12
            m = (self.birth_month - 1 + idx) % 12 + 1
            value = 0
            for tr in self.poster.tracks:
                dt = tr.start_time_local
                if dt.year == y and dt.month == m:
                    if use_duration:
                        if tr.end_time and tr.start_time_local:
                            value += max(
                                0,
                                (tr.end_time - tr.start_time_local).total_seconds(),
                            )
                    else:
                        value += tr.length
            month_values.append((y, m, value))
        # determine value range for color scaling when using duration
        if use_duration:
            positives = [v for _, _, v in month_values if v > 0]
            value_min = min(positives) if positives else 0
            value_max = max(positives) if positives else 0
            duration_range = ValueRange.from_pair(value_min, value_max)
        # draw circles
        for idx, (y, m, value) in enumerate(month_values):
            x_idx = idx % cols
            y_idx = idx // cols
            cx = offset.x + spacing_x * x_idx + spacing_x / 2
            cy = offset.y + spacing_y * y_idx + spacing_y / 2

            current_date = datetime.datetime.now()
            month_date = datetime.datetime(y, m, 1)
            is_past = month_date < current_date

            color = "gray" if is_past else "#444444"
            age = (y - self.birth_year) + ((m - self.birth_month) / 12)
            title = f"{y}-{m:02d} ({int(age)} years old)"
            if value > 0:
                if use_duration:
                    # Interpolate between track and track2 colors based on
                    # this month's total duration vs the observed range.
                    color1 = self.poster.colors["track"]
                    color2 = self.poster.colors["track2"]
                    diff = duration_range.diameter()
                    if diff == 0:
                        color = color1
                    else:
                        ratio = (value - duration_range.lower()) / diff
                        color = interpolate_color(color1, color2, ratio)
                    hours = value / 3600.0
                    title = f"{title} {hours:.1f} h"
                else:
                    # Set color based on special distance ranges and generate
                    # gradients or use special colors
                    sd1 = self.poster.special_distance["special_distance"]
                    sd2 = self.poster.special_distance["special_distance2"]
                    dist_units = self.poster.m2u(value)
                    if sd1 < dist_units < sd2:
                        color = self.color(
                            self.poster.length_range_by_date, value, True
                        )
                    elif dist_units >= sd2:
                        color = self.poster.colors.get(
                            "special2"
                        ) or self.poster.colors.get("special")
                    else:
                        color = self.color(
                            self.poster.length_range_by_date, value, False
                        )
                    val = format_float(dist_units)
                    title = f"{title} {val} {self.poster.u()}"
            circle = dr.circle(center=(cx, cy), r=radius, fill=color)
            circle.set_desc(title=title)
            dr.add(circle)
