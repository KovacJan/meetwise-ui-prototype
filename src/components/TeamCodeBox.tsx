import {useState} from "react";
import {Copy, Check} from "lucide-react";
import {useTranslations} from "next-intl";
import GlassCard from "@/components/GlassCard";

interface TeamCodeBoxProps {
  code: string;
}

const TeamCodeBox = ({code}: TeamCodeBoxProps) => {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("team");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <GlassCard className="flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          {t("code")}
        </p>
        <p className="text-xl font-mono font-bold text-foreground tracking-wider">{code}</p>
      </div>
      <button
        onClick={handleCopy}
        className="glass rounded-lg p-2.5 hover:bg-secondary/20 transition-colors shrink-0"
      >
        {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-muted-foreground" />}
      </button>
    </GlassCard>
  );
};

export default TeamCodeBox;
