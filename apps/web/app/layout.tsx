import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kafka Visual Playground",
  description: "Scenario-driven Kafka learning backed by demo mode or Aiven for Apache Kafka."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
