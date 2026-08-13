import CommonAppLayout from "@/app/_components/common-app-layout";
import { RwaRollbacksPage } from "@/components/rwa-rollbacks/rwa-rollbacks-page";

export default function RwaRollbacksRoute() {
  return (
    <CommonAppLayout className="bg-[#05090D]">
      <RwaRollbacksPage />
    </CommonAppLayout>
  );
}
