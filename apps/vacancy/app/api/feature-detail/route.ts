import { NextResponse } from "next/server";
import { getGemeente } from "@lumen/pdok-client";
import { fetchFeatureDetail } from "@/lib/bag-fetch";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gemeenteCode = searchParams.get("gemeenteCode")?.trim();
  const identificatie = searchParams.get("identificatie")?.trim();

  if (!gemeenteCode || !identificatie) {
    return NextResponse.json(
      {
        error:
          "Query parameters 'gemeenteCode' en 'identificatie' zijn verplicht.",
      },
      { status: 400 },
    );
  }

  const gemeente = getGemeente(gemeenteCode);
  if (!gemeente) {
    return NextResponse.json(
      { error: `Onbekende gemeenteCode '${gemeenteCode}'.` },
      { status: 404 },
    );
  }

  try {
    const feature = await fetchFeatureDetail(gemeente, identificatie);
    if (!feature) {
      return NextResponse.json(
        { error: `Object '${identificatie}' niet gevonden.` },
        { status: 404 },
      );
    }

    return NextResponse.json({ feature });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as Error).message || "Detailobject kon niet worden geladen.",
      },
      { status: 500 },
    );
  }
}
