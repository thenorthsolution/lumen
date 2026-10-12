import { SpatialWorkspace } from "@/components/SpatialWorkspace";
import { getCloudConfiguration } from "@/lib/cloud/config";
import { getCloudIdentity } from "@/lib/cloud/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [identity, services] = await Promise.all([getCloudIdentity(), Promise.resolve(getCloudConfiguration())]);
  return <SpatialWorkspace identity={identity} services={services} />;
}
