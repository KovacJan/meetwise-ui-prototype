import Loader from "@/components/Loader";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 flex items-center justify-center">
          <Loader variant="page" />
        </main>
      </div>
    </div>
  );
}
