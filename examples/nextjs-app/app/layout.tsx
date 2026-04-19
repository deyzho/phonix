import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Axon Example App',
  description: 'Example Next.js app using @axonsdk/sdk for confidential edge inference',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
