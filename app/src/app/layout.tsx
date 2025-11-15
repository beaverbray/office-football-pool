import './globals.css'

export const metadata = {
  title: 'Spread Analysis System',
  description: 'Picksheet Market Comparison Engine',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-black">
        {children}
      </body>
    </html>
  )
}
