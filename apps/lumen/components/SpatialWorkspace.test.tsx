import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialWorkspace } from "./SpatialWorkspace";
import { worldStore } from "@/lib/world-store";
import { entityId } from "@lumen/world";

vi.mock("./WorldCanvas", () => ({ WorldCanvas: () => <div aria-label="Testwereld" /> }));

describe("SpatialWorkspace", () => {
  beforeEach(() => worldStore.reset());
  afterEach(() => vi.unstubAllGlobals());

  it("toggles layers through the canonical command store", () => {
    render(<SpatialWorkspace />);
    expect(screen.queryByRole("button", { name: /linkerzijbalk|lagenpaneel/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Leegstand/i }));
    expect(worldStore.getState().layers.vacancy?.visible).toBe(false);
  });

  it("shows honest feedback when voice is unavailable", () => {
    render(<SpatialWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Start spraakbediening" }));
    expect(screen.getByText(/Spraakbediening is beschikbaar zodra Lumen AI is verbonden/)).toBeInTheDocument();
  });

  it("shows compact anonymous account actions without redundant navigation controls", () => {
    render(<SpatialWorkspace />);
    expect(screen.getByRole("link", { name: "Account maken" })).toHaveAttribute("href", "/auth/sign-in?intent=register");
    expect(screen.getByRole("link", { name: "Aanmelden" })).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.queryByText("WERKGEBIED")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Lumen AI" })).not.toBeInTheDocument();
  });

  it("focuses the compact composer by keyboard and opens history on request", () => {
    render(<SpatialWorkspace />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("textbox", { name: "Geef Lumen een opdracht" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Toon gesprek" }));
    expect(screen.getByRole("button", { name: "Sluit gesprek" })).toBeInTheDocument();
  });

  it("switches to the lazy 3D renderer state", () => {
    render(<SpatialWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(worldStore.getState().renderer).toBe("world-3d");
  });

  it("keeps object details in the unified panel and clears selection", () => {
    const id = entityId("bag-pand-test");
    worldStore.replaceEntitiesOfType("building", [{ id, type: "building", name: "BAG-pand test", description: "Testpand", properties: { identificatie: "test" }, provenance: [] }]);
    worldStore.execute({ type: "select_entity", entityId: id });
    render(<SpatialWorkspace />);

    expect(screen.getByRole("complementary", { name: "Verkennen paneel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Selectie wissen" }));

    expect(worldStore.getState().selectedEntityId).toBeNull();
    expect(screen.getByText("Selecteer een object")).toBeInTheDocument();
  });

  it("shows source date, confidence, method, and explicit missing limitations", () => {
    const id = entityId("bag-pand-evidence");
    worldStore.replaceEntitiesOfType("building", [{
      id, type: "building", name: "BAG-pand bewijs", properties: { bouwjaar: 1982 },
      provenance: [{ sourceId: "bag", sourceLabel: "BAG via PDOK", sourceUrl: "https://www.pdok.nl", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified", methodVersion: "bag-ogc-v2" }],
    }]);
    worldStore.execute({ type: "select_entity", entityId: id });
    render(<SpatialWorkspace />);

    expect(screen.getByText("Methode: bag-ogc-v2")).toBeInTheDocument();
    expect(screen.getByText("Beperkingen: niet geregistreerd")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Bronnen" }));
    expect(screen.getByRole("link", { name: "BAG via PDOK" })).toHaveAttribute("href", "https://www.pdok.nl");
  });

  it("distinguishes disconnected data from a research conclusion", () => {
    const id = entityId("bag-pand-no-energy");
    worldStore.replaceEntities([{ id, type: "building", name: "Pand zonder energiedata", properties: {}, provenance: [] }]);
    worldStore.execute({ type: "select_entity", entityId: id });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("tab", { name: "Energie" }));

    expect(screen.getByText("Energiebron nog niet aangesloten")).toBeInTheDocument();
    expect(screen.queryByText("Nader onderzoek nodig")).not.toBeInTheDocument();
  });

  it("shows named nearby OSM amenities without a duplicate generic empty state", () => {
    const buildingId = entityId("bag-pand-with-amenities");
    const schoolId = entityId("osm-school");
    worldStore.replaceEntities([
      { id: buildingId, type: "building", name: "Testpand", properties: {}, provenance: [], geometry: { kind: "point", center: [6.155, 52.255], coordinateSystem: "WGS84" } },
      { id: schoolId, type: "infrastructure", name: "Deventer Basisschool", properties: { amenity: "school", category: "School" }, provenance: [{ sourceId: "openstreetmap", sourceLabel: "© OpenStreetMap contributors", sourceUrl: "https://www.openstreetmap.org/copyright", retrievedAt: "2026-09-12T00:00:00.000Z", confidence: "medium", methodVersion: "osm-overpass-poi-1.0.0" }], geometry: { kind: "point", center: [6.155, 52.258], coordinateSystem: "WGS84" } },
    ]);
    worldStore.execute({ type: "select_entity", entityId: buildingId });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("tab", { name: "Omgeving" }));

    expect(screen.getByText("Deventer Basisschool")).toBeInTheDocument();
    expect(screen.getByText("DICHTSTBIJZIJND VIA OSM")).toBeInTheDocument();
    expect(screen.queryByText("Nader onderzoek nodig")).not.toBeInTheDocument();
  });

  it("resets object details to overview after selecting a different object", () => {
    const buildingId = entityId("bag-pand-tab-reset");
    const parcelId = entityId("brk-perceel-tab-reset");
    worldStore.replaceEntities([
      { id: buildingId, type: "building", name: "Testgebouw", properties: {}, provenance: [] },
      { id: parcelId, type: "parcel", name: "Testperceel", properties: {}, provenance: [] },
    ]);
    worldStore.execute({ type: "select_entity", entityId: buildingId });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("tab", { name: "Bronnen" }));
    expect(screen.getByRole("tab", { name: "Bronnen" })).toHaveAttribute("aria-selected", "true");

    act(() => {
      worldStore.execute({ type: "select_entity", entityId: parcelId });
    });

    expect(screen.getByRole("heading", { name: "Testperceel" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overzicht" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps provenance inspectable for parcels", () => {
    const id = entityId("brk-perceel-sources");
    worldStore.replaceEntities([{ id, type: "parcel", name: "Deventer A 42", properties: {}, provenance: [{ sourceId: "pdok-brk", sourceLabel: "Kadastrale Kaart via PDOK", sourceUrl: "https://www.pdok.nl", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified", methodVersion: "brk-ogc-v1" }] }]);
    worldStore.execute({ type: "select_entity", entityId: id });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("tab", { name: "Bronnen" }));

    expect(screen.getByRole("link", { name: "Kadastrale Kaart via PDOK" })).toHaveAttribute("href", "https://www.pdok.nl");
    expect(screen.getByText("Methode: brk-ogc-v1")).toBeInTheDocument();
  });

  it("shows a source-aware comparison with explicit unknown values", () => {
    const id = entityId("bag-pand-compare");
    worldStore.replaceEntities([{ id, type: "building", name: "Vergelijkpand", properties: { bouwjaar: 1982 }, provenance: [{ sourceId: "bag", sourceLabel: "BAG via PDOK", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified", methodVersion: "bag-ogc-v2", limitations: ["Geen verblijfsobjectdetails geladen."] }] }]);
    worldStore.execute({ type: "toggle_comparison_entity", entityId: id });
    worldStore.execute({ type: "set_active_tool", tool: "compare" });
    render(<SpatialWorkspace />);

    expect(screen.getByRole("table", { name: "Objectvergelijking" })).toBeInTheDocument();
    expect(screen.getByText("Vergelijkpand")).toBeInTheDocument();
    expect(screen.getByText("BAG via PDOK")).toBeInTheDocument();
    expect(screen.getAllByText("Onbekend").length).toBeGreaterThan(0);
    expect(screen.getByRole("cell", { name: /1982.*Methode: bag-ogc-v2.*Geen verblijfsobjectdetails geladen/i })).toBeInTheDocument();
  });

  it("shows provenance and explicit unknowns for a suitability assessment", () => {
    const id = entityId("brk-parcel-analysis");
    worldStore.replaceEntities([{ id, type: "parcel", name: "Analyseperceel", properties: { kadastraleOppervlakteM2: 1_250 }, provenance: [{ sourceId: "brk", sourceLabel: "Kadastrale Kaart via PDOK", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified", methodVersion: "brk-ogc-v1", limitations: ["Planregels zijn niet inbegrepen."] }] }]);
    worldStore.execute({ type: "select_entity", entityId: id });
    worldStore.execute({ type: "set_active_tool", tool: "analyze" });
    render(<SpatialWorkspace />);

    expect(screen.getByText("Analyseverantwoording")).toBeInTheDocument();
    expect(screen.getByText(/methode known-input-suitability-1.0.0/)).toBeInTheDocument();
    expect(screen.getAllByText("Geen beoordeelbare bronwaarde").length).toBeGreaterThan(0);
    expect(screen.getByText("Methode: brk-ogc-v1")).toBeInTheDocument();
    expect(screen.getByText("Beperkingen: Planregels zijn niet inbegrepen.")).toBeInTheDocument();
  });

  it("finds loaded canonical objects and opens them from the search tool", () => {
    const id = entityId("bag-pand-searchable");
    worldStore.replaceEntities([{ id, type: "building", name: "Bibliotheek Deventer", geometry: { kind: "polygon", center: [6.155, 52.255], bounds: [6.154, 52.254, 6.156, 52.256], coordinateSystem: "WGS84" }, properties: { identificatie: "searchable" }, provenance: [{ sourceId: "bag", sourceLabel: "BAG via PDOK", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified" }] }]);
    worldStore.execute({ type: "set_active_tool", tool: "search" });
    render(<SpatialWorkspace />);

    fireEvent.change(screen.getByRole("textbox", { name: "Zoek locatie of object" }), { target: { value: "bibliotheek" } });
    fireEvent.click(screen.getByRole("button", { name: /Bibliotheek Deventer/ }));

    expect(worldStore.getState().selectedEntityId).toBe(id);
    expect(worldStore.getState().camera.center).toEqual([6.155, 52.255]);
    expect(worldStore.getState().activeTool).toBe("explore");
  });

  it("turns an official address search result into a selected canonical object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      message: "1 gevalideerde locatie gevonden via PDOK.",
      locations: [{
        externalId: "adres.0150200000000001", entityType: "address", kind: "adres", name: "Brink 1, Deventer",
        longitude: 6.155, latitude: 52.255, recommendedZoom: 17,
        provenance: { sourceId: "pdok-location-api", sourceLabel: "PDOK Location API", sourceUrl: "https://api.pdok.nl", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified", methodVersion: "pdok-location-search-1.0.0" },
      }],
    }), { status: 200 })));
    worldStore.execute({ type: "set_active_tool", tool: "search" });
    render(<SpatialWorkspace />);

    fireEvent.change(screen.getByRole("textbox", { name: "Zoek locatie of object" }), { target: { value: "Brink 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Zoek" }));
    fireEvent.click(await screen.findByRole("button", { name: /Brink 1, Deventer/ }));

    await waitFor(() => expect(worldStore.getState().selectedEntityId).toBe("pdok-address-adres.0150200000000001"));
    expect(worldStore.getState().entities["pdok-address-adres.0150200000000001"]).toMatchObject({ type: "address", name: "Brink 1, Deventer", provenance: [{ sourceId: "pdok-location-api" }] });
    expect(worldStore.getState().activeTool).toBe("explore");
    expect(screen.getByRole("heading", { name: "Brink 1, Deventer" })).toBeInTheDocument();
  });

  it("navigates explicit area relationships from district to municipality", () => {
    const municipalityId = entityId("cbs-municipality-GM0150");
    const districtId = entityId("cbs-district-WK015005");
    worldStore.replaceEntities([
      { id: municipalityId, type: "municipality", name: "Deventer", properties: { code: "GM0150" }, provenance: [] },
      { id: districtId, type: "district", name: "Keizerslanden", properties: { code: "WK015005", parentName: "Deventer" }, relatedEntityIds: [municipalityId], provenance: [] },
    ]);
    worldStore.execute({ type: "select_entity", entityId: districtId });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /Deventer municipality/ }));

    expect(worldStore.getState().selectedEntityId).toBe(municipalityId);
    expect(screen.getByRole("heading", { name: "Deventer" })).toBeInTheDocument();
  });

  it("edits and persists a drawing color through the drawing tool", () => {
    worldStore.execute({ type: "add_drawing", drawing: { id: "drawing-color", kind: "polygon", name: "Bouwlocatie", coordinates: [[6.15, 52.25], [6.16, 52.25], [6.16, 52.26]], color: "#315df0", version: 1, createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" } });
    worldStore.execute({ type: "set_active_tool", tool: "draw" });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Kleur Warm geel" }));
    fireEvent.click(screen.getByRole("button", { name: "Bewaar" }));

    expect(worldStore.getState().drawings[0]).toMatchObject({ color: "#d9ad63", version: 2 });
  });

  it("creates, calculates, and visualizes a scenario from the projects panel", () => {
    const id = entityId("site-scenario");
    worldStore.replaceEntities([{ id, type: "site", name: "Testlocatie", geometry: { kind: "polygon", bounds: [6.15, 52.25, 6.16, 52.26], coordinateSystem: "WGS84" }, properties: { areaM2: 10_000 }, provenance: [] }]);
    worldStore.execute({ type: "create_project", siteId: id, name: "Testproject" });
    worldStore.execute({ type: "set_active_tool", tool: "projects" });
    render(<SpatialWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Maak scenario" }));
    expect(screen.getAllByText("Basisscenario")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Bereken indicatie" }));
    expect(screen.getByText("171–245")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toon indicatief volume in 2D en 3D" }));

    expect(worldStore.getState().scenarioObjects).toHaveLength(1);
    expect(worldStore.getState().scenarioObjects[0]?.provenance[0]?.methodVersion).toBe("indicative-massing-1.0.0");
  });
});
