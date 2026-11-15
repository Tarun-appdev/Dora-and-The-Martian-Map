#!/usr/bin/env python3
"""Build a compact real-DEM heightmap for the first-person EVA HUD.

The HUD's world frame is Site ENU metres relative to the Perseverance landing site
(18.44463 N, 77.45089 E). The habitat/airlock offset is configured separately in
mission.json as terrain_origin_offset: [east_m, north_m].
"""
import json
import os
import sys
import numpy as np
import rasterio
from rasterio.enums import Resampling

HERE = os.path.dirname(os.path.abspath(__file__))
DEM = os.path.join(HERE, "jezero-planner", "data", "M20_JezeroCrater_CTXDEM_20m.tif")
OUT = os.path.join(HERE, "terrain")
FACTOR = 2  # 40 m grid derived from the 20 m DEM; preserves actual measured elevations.
MARS_R = 3396190.0
LAT_TS = np.deg2rad(18.4663)
LANDING_LAT = 18.44463
LANDING_LON = 77.45089
LAT_TS_DEG = 18.4663

def projected(lon, lat):
    return (MARS_R * np.deg2rad(lon) * np.cos(LAT_TS), MARS_R * np.deg2rad(lat))

def main():
    if not os.path.exists(DEM):
        sys.exit(f"Real Jezero DEM not found: {DEM}\nRun: python get_data.py")
    os.makedirs(OUT, exist_ok=True)
    with rasterio.open(DEM) as ds:
        h, w = ds.height // FACTOR, ds.width // FACTOR
        z = ds.read(1, out_shape=(h, w), resampling=Resampling.average).astype('<f4')
        nodata = ds.nodata
        t = ds.transform
        # Use exact per-axis resampling ratios (the source width is odd: 5067 px).
        factor_x, factor_y = ds.width / w, ds.height / h
        # Resampled pixel centres correspond to the centre of each source-pixel block.
        x0_proj, y0_proj = t * (factor_x / 2, factor_y / 2)
        # Convert the DEM's equirectangular grid into the planner's exact local Site ENU frame.
        lon0 = x0_proj / (MARS_R * np.cos(np.deg2rad(LAT_TS_DEG)))
        lat0 = y0_proj / MARS_R
        lat_anchor = np.deg2rad(LANDING_LAT)
        lon_anchor = np.deg2rad(LANDING_LON)
        x0 = MARS_R * np.cos(lat_anchor) * (lon0 - lon_anchor)
        y0 = MARS_R * (lat0 - lat_anchor)
        dx = t.a * factor_x * np.cos(lat_anchor) / np.cos(np.deg2rad(LAT_TS_DEG))
        dy = t.e * factor_y
        crs = str(ds.crs)
    if nodata is not None:
        z[np.isclose(z, nodata)] = np.nan
    origin_x, origin_y = projected(LANDING_LON, LANDING_LAT)
    # Sample the exact landing site elevation from the native DEM.
    with rasterio.open(DEM) as ds:
        rr, cc = ds.index(origin_x, origin_y)
        origin_elev = float(ds.read(1, window=((rr, rr+1), (cc, cc+1)))[0, 0])
    z.tofile(os.path.join(OUT, 'elevation.f32'))
    meta = {
        'format': 'Float32 little-endian row-major', 'width': int(w), 'height': int(h),
        'downsample_factor_xy': [float(factor_x), float(factor_y)], 'source_resolution_m': float(abs(t.a)),
        'grid_resolution_m': float(abs(dx)), 'x0_east_m': float(x0), 'y0_north_m': float(y0),
        'dx_m': float(dx), 'dy_m': float(dy), 'origin_elevation_m': origin_elev,
        'origin': {'name': 'Perseverance landing site', 'latitude_planetocentric_deg': LANDING_LAT,
                   'longitude_east_deg': LANDING_LON},
        'crs': crs, 'vertical_exaggeration': 3.0,
        'coordinate_frame': 'Exact planner SiteFrame ENU metres relative to Perseverance landing site; east positive, north positive'
    }
    with open(os.path.join(OUT, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"Wrote {w} x {h} heightmap ({os.path.getsize(os.path.join(OUT, 'elevation.f32'))/1e6:.1f} MB)")
    print(f"Grid spacing: {abs(dx):.1f} m; origin elevation: {origin_elev:.1f} m")
    print('HUD local coordinates are anchored at the landing site. Set terrain_origin_offset in mission.json to the habitat/airlock offset.')

if __name__ == '__main__':
    main()
