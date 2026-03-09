import {Resend} from "resend";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";

const resend = new Resend(process.env.RESEND_API_KEY);

interface InvitePayload {
  members: Array<{name: string; email: string}>;
  teamName: string;
  senderName: string;
  joinLink: string;
}

function generateInviteEmail({
  recipientName,
  senderName,
  teamName,
  joinLink,
}: {
  recipientName: string;
  senderName: string;
  teamName: string;
  joinLink: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to ${teamName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f1127;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0f1127;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#00c8ff,#0078d4);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;text-align:center;line-height:40px;">M</div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">MeetWise</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:20px;padding:40px 36px;text-align:center;">

              <!-- Badge -->
              <div style="display:inline-block;background:rgba(0,200,255,0.12);border:1px solid rgba(0,200,255,0.25);border-radius:20px;padding:5px 16px;margin-bottom:28px;">
                <span style="color:#00c8ff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">Team Invitation</span>
              </div>

              <!-- Heading -->
              <h1 style="margin:0 0 14px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">
                ${recipientName ? `Hi ${recipientName},` : "You've been invited!"}
              </h1>

              <!-- Body text -->
              <p style="margin:0 0 6px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.6;">
                <strong style="color:rgba(255,255,255,0.80);">${senderName}</strong> has added you to
              </p>
              <p style="margin:0 0 36px;font-size:20px;font-weight:700;color:#ffffff;">
                ${teamName}
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.45);line-height:1.6;max-width:380px;margin-left:auto;margin-right:auto;">
                MeetWise tracks real meeting costs so your team can optimize time and budget. Click below to get started.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 32px;">
                <tr>
                  <td style="border-radius:12px;background:linear-gradient(135deg,#00a4ef,#0078d4);box-shadow:0 4px 18px rgba(0,120,212,0.40);">
                    <a href="${joinLink}" style="display:inline-block;padding:14px 40px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;letter-spacing:0.2px;">
                      Join the Team →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
                <p style="margin:0 0 10px;font-size:12px;color:rgba(255,255,255,0.25);">Or copy this link:</p>
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 14px;word-break:break-all;">
                  <span style="font-family:monospace;font-size:11px;color:rgba(255,255,255,0.40);">${joinLink}</span>
                </div>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.18);">
                MeetWise &mdash; Know the real cost of your meetings
              </p>
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.12);">
                You received this because ${senderName} added you to their team.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(req: Request) {
  try {
    // Verify the caller is authenticated
    const supabase = await createSupabaseServerClient();
    const {
      data: {user},
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({error: "Unauthorized"}, {status: 401});
    }

    const body = (await req.json()) as InvitePayload;
    const {members, teamName, senderName, joinLink} = body;

    if (!members?.length || !teamName || !joinLink) {
      return Response.json({error: "Missing required fields"}, {status: 400});
    }

    const fromAddress =
      process.env.RESEND_FROM_EMAIL ?? "MeetWise <onboarding@resend.dev>";

    const results = await Promise.allSettled(
      members.map(({name, email}) =>
        resend.emails.send({
          from: fromAddress,
          to: email,
          subject: `${senderName} invited you to join ${teamName} on MeetWise`,
          html: generateInviteEmail({
            recipientName: name,
            senderName,
            teamName,
            joinLink,
          }),
        }),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return Response.json({sent, failed});
  } catch (err) {
    console.error("send-invite error", err);
    return Response.json(
      {error: err instanceof Error ? err.message : "Failed to send invites"},
      {status: 500},
    );
  }
}
