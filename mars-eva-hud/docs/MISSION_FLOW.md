# Mission flow: plan, export, load, go

The mission planner and the 3D HUD work together through a single file. Nothing needs to be online while the crew is out.

```
mission planner  --Export mission for HUD-->  hud_mission_*.json  --Load mission file-->  3D HUD (phone)
```

## 1. Plan the route (mission planner)

1. Start the planner (`python app.py` in `jezero-planner/`) and open it in a browser.
2. Set the goal, mode (walk or rover), priority and any dust or SEP conditions, then press **Plan optimal route**.
3. Check the verdict and alerts under the map.
4. Press **Export mission for HUD**. A file named like `hud_mission_walk_min_eta.json` is downloaded.
   - If the verdict is NO-GO or HOLD, or the inputs changed since planning, the planner asks you to confirm first.

## 2. Move the file to the phone

Any way you like: email, cloud drive, AirDrop, USB, or the base server. The file is small (tens of kilobytes).

## 3. Load it in the HUD

1. Open the HUD on the phone (it must be the https site so the motion sensors work).
2. Tap **Menu**, then **Load mission file**, and pick the file. On a computer you can also drag the file onto the page.
3. The Menu shows the mission name, length, number of gates and the planner's verdict. The menu closes and the route appears in 3D on the terrain.
4. The HUD saves the mission on the phone, so it still works after leaving Wi-Fi range.

The HUD also accepts the planner's raw message (the file from **Download planner message** under Waypoints) and converts it itself.

## 4. Go about the mission

- Tap **Enable motion** and **Face path**, then follow the glowing line. Gates mark the start, fix stops, the turn-back point and the goal. The next gate is highlighted and the compass tape shows its bearing.
- Amber zones are the planner's hard-terrain sections. Red zones are hazards.
- Moving: your steps move you along the route. **Sim walk** and **Step +5 m** are there for testing.
- Reaching a gate advances to the next one. At the end you see "Goal reached".
- Planner alerts (for example fix stops added, or low position confidence) are shown when the mission loads and are listed in the Menu log.

## What is in the file

```json
{
  "format": "eva-hud-mission", "version": 1, "frame": "site-enu",
  "name": "Walk, min_eta", "brief": "GO - return margin OK  |  3.0 km  |  ETA 96 min",
  "path":      [ { "x": 0, "y": 0 }, ... ],
  "waypoints": [ { "x": 0, "y": 0, "name": "Start" }, { "x": 750, "y": 531, "name": "Fix stop 1 (landmark, 60 s)" }, ... ],
  "hazards":   [ { "x": 962, "y": 585, "r": 40, "name": "Hard terrain", "kind": "caution" } ],
  "alerts":    [ { "type": "fix_stop", "msg": "..." } ],
  "source":    { "planner": "jezero-mission-planner", "created": "...", "mode": "walk", "profile": "min_eta" }
}
```

Coordinates are Site ENU metres (east, north) from the Perseverance landing site, which is also the frame of the terrain in `terrain/`. Route and terrain therefore line up with no offset. A hand-written mission measured from a habitat instead can add `"terrain_origin_offset": [east_m, north_m]`, and the HUD shifts everything onto the terrain.

`examples/hud_mission.sample.json` is a **synthetic** file in this format, for trying the HUD without the planner. It is not real planner output.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not load ...: no waypoints found" | The file is not a HUD or planner mission. Export it again with **Export mission for HUD** |
| Route line missing, flat dark background | The 3D terrain did not load. Check the browser console and that `terrain/` and `vendor/` are deployed |
| Route ends at the edge of nothing | The route leaves the elevation map. The 3D layer skips points outside it |
| Old mission appears | Loading a new file replaces the saved one |
