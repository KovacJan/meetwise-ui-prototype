import {redirect} from "next/navigation";

export default function ResetPasswordPage() {
  // Legacy route without locale – redirect to default English locale.
  redirect("/en/reset");
}

