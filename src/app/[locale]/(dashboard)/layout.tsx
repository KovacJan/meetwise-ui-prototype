import type {ReactNode} from "react";
import MobileBottomNav from "@/components/MobileBottomNav";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <MobileBottomNav />
    </>
  );
}
