"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useWorldSelector } from "@/lib/world-store";

const Renderer3D = dynamic(() => import("./Renderer3DPlaceholder"), { ssr: false, loading: () => <div className="rendererLoading">3D-ruimte voorbereiden</div> });
const MapLibreWorld = dynamic(() => import("./MapLibreWorld"), { ssr: false, loading: () => <div className="rendererLoading">Kaart en BAG-gegevens voorbereiden</div> });

export function WorldCanvas() {
  const is3D = useWorldSelector((state) => state.renderer === "world-3d");
  const [hasMounted3D, setHasMounted3D] = useState(is3D);

  useEffect(() => {
    if (is3D) setHasMounted3D(true);
  }, [is3D]);

  return <div className="worldRendererStack">
    <div className="worldRendererLayer" aria-hidden={is3D}><MapLibreWorld active={!is3D} /></div>
    {hasMounted3D ? <div className="worldRendererLayer" aria-hidden={!is3D}><Renderer3D active={is3D} /></div> : null}
  </div>;
}
