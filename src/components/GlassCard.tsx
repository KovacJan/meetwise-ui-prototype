import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

const GlassCard = ({ children, className, onClick }: GlassCardProps) => (
  <div
    onClick={onClick}
    className={cn(
      "glass rounded-2xl p-6 transition-all duration-300",
      onClick && "cursor-pointer glass-hover",
      className
    )}
  >
    {children}
  </div>
);

export default GlassCard;
