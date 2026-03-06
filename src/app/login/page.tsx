import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { LiquidGlass } from "@/components/ui/liquid-glass";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/app/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <LiquidGlass className="w-full max-w-sm rounded-[24px] p-8">
        <div className="text-center space-y-1 mb-6">
          <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Orbit</h1>
          <p className="text-[13px] tracking-[-0.01em] text-foreground/45">Sign in to continue</p>
        </div>
        <LoginForm />
      </LiquidGlass>
    </div>
  );
}
