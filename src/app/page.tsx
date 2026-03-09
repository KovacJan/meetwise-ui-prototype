import {redirect} from "next/navigation";

export default function Home() {
  // Always redirect root to default locale.
  redirect("/en");
}

