import {NextResponse} from "next/server";
import {getPendingSurveyCount} from "@/app/[locale]/(dashboard)/surveys/actions";

export async function GET() {
  try {
    const count = await getPendingSurveyCount();
    return NextResponse.json({count});
  } catch {
    return NextResponse.json({count: 0});
  }
}

