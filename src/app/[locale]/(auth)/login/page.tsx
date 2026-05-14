import {LoginForm} from "./LoginForm";

export default async function LocaleLoginPage({
  searchParams,
}: {
  searchParams: Promise<{notice?: string; next?: string}>;
}) {
  const {notice, next} = await searchParams;
  return <LoginForm notice={notice} next={next} />;
}
