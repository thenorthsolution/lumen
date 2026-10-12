# Lumen spatial performance architecture

God's Eye View is the leading interaction and runtime reference for Lumen's map stack. Its useful patterns are independent data layers, a keyless basemap fallback ladder, generation guards for asynchronous switches, request budgets, an idle render governor, truthful fallbacks, and cold versus warm performance measurement. Lumen keeps its own renderer-neutral contracts and does not copy tactical UI, moving-contact logic, or renderer-owned domain state.

## Renderer stack

- MapLibre remains the fast 2D analytical renderer. Cesium owns terrain, 3D Tiles, and globe-scale views.
- Both adapters consume the same WGS84 camera, selection, layers, annotations, and provenance contracts.
- Public datasets are registered as independent layer adapters. No source may block the basemap or another layer.
- Cesium uses request-on-change rendering. Continuous rendering is acquired only by an active animation or camera interaction and released afterwards.
- Basemaps need a keyless fallback order. For the Dutch workspace this is PDOK, then OSM; 3D uses the open Dutch 3D Basisvoorziening.

## Kadaster low-latency path

PDOK's BAG OGC API is authoritative, free, keyless, updated daily, and exposes both Features and vector tiles. The public BAG vector tiles currently use EPSG:28992 `NetherlandsRDNewQuad`, while MapLibre and Cesium's normal web tile paths use WebMercator. Directly loading large feature collections is therefore a bridge, not the production architecture.

The production path is:

1. Mirror the daily BAG snapshot into PostGIS with the source timestamp and stable feature IDs.
2. Serve simplified EPSG:3857 MVT through a tile server and CDN. Cache immutable snapshot URLs for one year.
3. Load only visible display attributes in tiles. Fetch a single authoritative PDOK or mirrored feature after selection.
4. Use zoom-based LOD: municipality aggregates at low zoom, generalized buildings at middle zoom, full footprints only at close zoom.
5. Quantize viewport keys, debounce settled movement, abort superseded work, reject stale generations, cap responses, and keep a small client LRU.
6. Return `ETag`, `Cache-Control`, snapshot date, method version, and source provenance together. Cached geometry must never lose its evidence metadata.
7. Prewarm the selected municipality and adjacent tiles after the basemap settles, using idle time and a strict request budget.

## Current bridge

The current BAG bridge uses a five-minute shared-cache window with day-long stale revalidation, bounded viewports, an eight-second upstream timeout, a 120 ms movement delay, request cancellation, stale-generation guards and a small client LRU. Concurrent requests for the same quantized viewport share one promise. Building requests use an overscanned coverage window, keep existing contours visible while panning inside it and only fetch again after the visible viewport exits that coverage. Area requests stop entirely at building zoom, and hidden or out-of-range layers cancel outstanding work rather than allowing stale responses to commit. The basemap paints independently before BAG completes.

## Performance gates

- Basemap first paint p75 below 800 ms on a warm European connection.
- Interactive shell p75 below 1.5 s and initial spatial settle p75 below 2 s.
- Warm viewport BAG display below 100 ms. Cold CDN tile p75 below 400 ms.
- Selection detail p75 below 500 ms, with cached display data shown immediately.
- No stale viewport may commit after a newer camera request.
- Parked Cesium scenes must perform no continuous render loop.
- Record provider, snapshot, feature count, transferred bytes, cache state, abort count, long tasks, FPS, and heap for every benchmark.
