import type { Metadata } from "next";
import { Montserrat, Open_Sans, Poppins } from "next/font/google";
import "./globals.css";

// Tipografías del Manual de Marca Qubit 2025: "Titulares y encabezados:
// Orbitron Bold / Montserrat ExtraBold" (usamos la alternativa Montserrat
// para no introducir una fuente display nueva en un producto ya en
// producción), "Subtítulos: Poppins SemiBold", "Textos largos: Open Sans
// Regular" — Open Sans reemplaza a Roboto, que no está en el manual.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Qubit",
  description: "De una necesidad de software a requerimientos, historias y casos de prueba, en minutos.",
  icons: { icon: "/qubit-icon.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${montserrat.variable} ${poppins.variable} ${openSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
