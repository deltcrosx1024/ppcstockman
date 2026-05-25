import './globals.css';

export const metadata = {
  title: 'PPC Stock Management',
  description: 'Warehouse Management System for Motorcycle Repair and Retail',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}