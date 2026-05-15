import "./globals.css";

export const metadata = {
  title: "AI Piano MVP",
  description: "Record audio, convert to MIDI, and get feedback from Chou Sensei."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
