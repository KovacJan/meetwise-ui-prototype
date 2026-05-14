"use client";

import { useRouter } from "next/navigation";
import PollForm from "@/components/PollForm";

const Poll = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PollForm meetingName="Sprint Planning — Feb 20, 2025" onSubmit={() => router.push("/employee")} />
    </div>
  );
};

export default Poll;
