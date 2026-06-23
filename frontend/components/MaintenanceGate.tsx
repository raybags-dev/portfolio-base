"use client";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { getBootstrap } from "@/lib/api";
import MaintenancePage from "@/components/MaintenancePage";
import ThemeProvider from "@/components/ThemeProvider";
import ChatWidget from "@/components/ChatWidget";

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });

  const isAdmin = pathname.startsWith("/admin");
  const maintenanceActive = !!(data?.site_configuration?.maintenance_mode && !isAdmin);

  if (maintenanceActive) {
    return (
      <>
        <ThemeProvider theme={data!.theme} />
        <MaintenancePage data={data!} />
        <ChatWidget maintenanceActive />
      </>
    );
  }

  return (
    <>
      {children}
      {!isAdmin && <ChatWidget />}
    </>
  );
}
