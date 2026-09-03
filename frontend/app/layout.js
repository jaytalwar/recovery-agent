import "./globals.css";

export const metadata = {
  title: "Recovery Agent",
  description: "Autonomous recovery agent for failed & abandoned Razorpay payments",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-slate-900">{children}</body>
    </html>
  );
}
