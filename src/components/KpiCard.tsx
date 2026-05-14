import {cn} from "@/lib/utils";
import {ReactNode} from "react";
import {FlaskConical} from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  gradient: "purple-blue" | "blue-cyan" | "cyan-green" | "orange-red";
  subtitle?: string;
  onDetailOpen?: () => void;
}

const gradientMap = {
  "purple-blue": "gradient-purple-blue",
  "blue-cyan": "gradient-blue-cyan",
  "cyan-green": "gradient-cyan-green",
  "orange-red": "gradient-orange-red",
};

const KpiCard = ({title, value, icon, gradient, subtitle, onDetailOpen}: KpiCardProps) => (
  <div className="glass rounded-2xl overflow-hidden animate-fade-in">
    <div className={cn("px-5 py-3 flex items-center gap-2", gradientMap[gradient])}>
      {icon}
      <span className="text-sm font-medium text-foreground/90 flex-1">{title}</span>
    </div>
    <div className="p-5">
      <div className="text-3xl font-bold text-foreground leading-none mb-2">{value}</div>
      <div className="flex items-center justify-between gap-2">
        {subtitle && (
          <div className="text-sm text-muted-foreground leading-snug">{subtitle}</div>
        )}
          <button
            onClick={onDetailOpen}
            title="Show cost calculation breakdown"
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors shrink-0"
          >
            <FlaskConical size={14} />
          </button>
      </div>
    </div>
  </div>
);

export default KpiCard;
