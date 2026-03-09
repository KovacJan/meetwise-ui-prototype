import {RegisterForm} from "./RegisterForm";

export default async function LocaleRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{team?: string; next?: string}>;
}) {
  const {team, next} = await searchParams;
  return <RegisterForm teamCode={team} next={next} />;
}
