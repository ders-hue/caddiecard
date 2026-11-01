# Golf green vector workflow

Use this process whenever asked to build accurate green outlines for a course, for example: “Can you build the greens for Manor House GC?”

## Shared versus private data

- Untouched course and green vectors are shared course data. In production, store them centrally in Cloudflare so every CaddieCard user can use them.
- Personal break arrows, slope annotations, tips and notes belong only to the phone owner. Store those in browser-local storage unless the user explicitly enables a future Backup and Restore facility.
- Never upload personal markup with the shared green vectors.

## Extraction process

1. Locate the course with OpenStreetMap Nominatim and record its bounding box and OSM identity.
2. Fetch the small bounding box from the raw OSM API (`/api/0.6/map?bbox=west,south,east,north`).
3. Extract closed ways tagged `golf=green` and associate them with hole numbers from their names or references.
4. Extract ways tagged `golf=hole`. Their node order gives the playing direction and their `ref` identifies the hole.
5. Project latitude/longitude locally, centre each green polygon, and rotate it so the final direction of its `golf=hole` line points toward the top of the diagram.
6. Normalise each rotated polygon into a consistent SVG view box. Label the approach side `FRONT` and the opposite side `BACK`.
7. Retain the OSM way IDs, source date and attribution with the stored Cloudflare record.
8. Visually check every outline and orientation before publishing it.

## North Wilts reference implementation

- Course: OpenStreetMap way `135930022`.
- Raw bounds: west `-1.9811009`, south `51.3970078`, east `-1.9618541`, north `51.4041234`.
- Data contains 18 numbered closed green polygons, one practice green and 18 numbered `golf=hole` direction lines.
- The standalone implementation is `green-guide.html`.

## Licensing

OpenStreetMap data is ODbL. Display appropriate attribution and preserve the licensing/source metadata required for redistributed or derived data. Do not trace Google Maps or Google Earth imagery into CaddieCard.
