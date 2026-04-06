import { NextResponse } from "next/server";

type MapillaryImage = {
  id: string;
  captured_at?: string;
  thumb_2048_url?: string;
  thumb_1024_url?: string;
  compass_angle?: number;
  computed_geometry?: {
    coordinates?: [number, number];
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json(
      { error: "lng en lat zijn verplicht." },
      { status: 400 },
    );
  }

  const token =
    process.env.MAPILLARY_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json({
      configured: false,
      image: null,
      error:
        "Straatbeeld vereist een Mapillary access token in MAPILLARY_ACCESS_TOKEN of NEXT_PUBLIC_MAPILLARY_ACCESS_TOKEN.",
    });
  }

  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("access_token", token);
  url.searchParams.set(
    "fields",
    "id,captured_at,thumb_1024_url,thumb_2048_url,computed_geometry,compass_angle",
  );
  url.searchParams.set("closeto", `${lng},${lat}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        configured: true,
        image: null,
        error: `Mapillary gaf ${response.status} terug.`,
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    data?: MapillaryImage[];
  };
  const image = data.data?.[0] ?? null;

  return NextResponse.json({
    configured: true,
    image: image
      ? {
          id: image.id,
          capturedAt: image.captured_at ?? null,
          compassAngle: image.compass_angle ?? null,
          imageUrl: image.thumb_2048_url ?? image.thumb_1024_url ?? null,
          viewerUrl: `https://www.mapillary.com/app/?image_key=${image.id}`,
          coordinates: image.computed_geometry?.coordinates ?? null,
        }
      : null,
  });
}
