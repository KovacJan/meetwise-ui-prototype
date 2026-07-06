import {redirect} from "next/navigation";

export default function ForgotPasswordPage() {
  // Legacy route without locale – redirect to default English locale.
  redirect("/en/forgot");
}

