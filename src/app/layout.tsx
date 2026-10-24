import type { Metadata, Viewport } from "next";
import { DM_Sans, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { getNegocio } from "@/lib/negocio";
import { NEGOCIOS } from "@/lib/negocios";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Nombre, íconos y color cambian según el negocio elegido (cookie).
// Antes de elegir se muestra la marca de Shira.
export async function generateMetadata(): Promise<Metadata> {
  const n = (await getNegocio()) ?? NEGOCIOS.shira;
  return {
    title: n.nombre,
    description: `Sistema interno de ventas e inventario · ${n.nombre}`,
    manifest: n.manifest,
    icons: { icon: n.icono, apple: n.appleIcon },
    appleWebApp: { capable: true, title: n.nombreCorto, statusBarStyle: "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const n = (await getNegocio()) ?? NEGOCIOS.shira;
  return {
    themeColor: n.themeColor,
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const negocio = await getNegocio();

  return (
    <html
      lang="es"
      data-negocio={negocio?.id ?? "shira"}
      className={`${dmSans.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
