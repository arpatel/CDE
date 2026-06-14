"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";

export default function Home() {
  const { me, loading } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(me ? "/dashboard" : "/login");
  }, [me, loading, router]);
  return <div className="center-msg">Loading…</div>;
}
