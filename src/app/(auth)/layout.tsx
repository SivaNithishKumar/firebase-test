export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center bg-background">
      <div className="w-full max-w-md p-4 sm:p-0">{children}</div>
    </div>
  );
}
