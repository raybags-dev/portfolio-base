"use client";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { getBootstrap } from "@/lib/api";
import MaintenancePage from "@/components/MaintenancePage";
import ThemeProvider from "@/components/ThemeProvider";

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });

  if (data?.site_configuration?.maintenance_mode && !pathname.startsWith("/admin")) {
    return (
      <>
        <ThemeProvider theme={data.theme} />
        <MaintenancePage data={data} />
      </>
    );
  }

  return <>{children}</>;
}
